import * as vscode from 'vscode';

const config = vscode.workspace.getConfiguration('activityJournal');
const DEFAULT_SYNC_FREQUENCY = 5;
const syncFrequencyInMinutes = config.get<number>('syncFrequencyInMinutes') ?? DEFAULT_SYNC_FREQUENCY;
const githubOwner = config.get<string>('githubOwner') || '';
const githubRepo = config.get<string>('githubRepo') || '';
interface FileSession {
	fileUri: string;
	openedAt: Date;
	closedAt?: Date;
	savesCount: number;
	// Possibly track other stats like # of changes or save intervals
}
let projectsData: Map<string, Map<string, FileSession>> = new Map();
let finalizedSessions: Map<string, FileSession[]> = new Map();

function getCurrentProjectId(): string {
	return vscode.workspace.workspaceFolders?.[0].uri.toString() ?? "no-root";
}

function finalizeSession(projectId: string, session: FileSession) {
	console.log(`Finalizing session for ${projectId}: ${session.fileUri}`);
	if (!finalizedSessions.has(projectId)) {
		finalizedSessions.set(projectId, []);
	}
	finalizedSessions.get(projectId)!.push(session);
}

async function getGithubToken(context: vscode.ExtensionContext): Promise<string | undefined> {
	let token = await context.secrets.get('activityJournalGitHubToken');
	if (!token) {
		// If none stored, prompt the user once
		const userInput = await vscode.window.showInputBox({
			prompt: "Enter your GitHub Personal Access Token (with repo permissions)",
			ignoreFocusOut: true,
			password: true
		});
		if (userInput) {
			token = userInput;
			await context.secrets.store('activityJournalGitHubToken', token);
		}
	}
	return token;
}

function generateMarkdownLog(sessions: FileSession[]): string {
	let content = `# Activity Log - ${new Date().toISOString()}\n\n`;

	for (const session of sessions) {
		const duration = session.closedAt && session.openedAt
			? (session.closedAt.getTime() - session.openedAt.getTime()) / 1000
			: 0;
		content += `- **File:** ${session.fileUri}\n`;
		content += `  - Opened at: ${session.openedAt.toLocaleString()}\n`;
		content += `  - Closed at: ${session.closedAt?.toLocaleString()}\n`;
		content += `  - Duration: ${duration} seconds\n`;
		content += `  - Saves: ${session.savesCount}\n\n`;
	}

	return content;
}

async function commitMarkdownFileToGitHub(
	token: string,
	owner: string,
	repo: string,
	filePath: string,
	content: string
): Promise<void> {
	const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

	const base64Content = Buffer.from(content).toString('base64');

	const body = {
		message: `Add activity log ${filePath}`,
		content: base64Content
	};

	const response = await fetch(url, {
		method: 'PUT',
		headers: {
			'Accept': 'application/vnd.github.v3+json',
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const respText = await response.text();
		throw new Error(`GitHub API error: ${response.status} - ${respText}`);
	}
}

function shouldSkipFile(filePath: string): boolean {
	// Skip any file inside a .git folder
	return filePath.includes(`.git`) ||
		filePath.startsWith(`git`);
}

async function syncWithGitHub(context: vscode.ExtensionContext) {
	const token = await getGithubToken(context);
	if (!token) {
		vscode.window.showErrorMessage('No GitHub token available. Please set your token.');
		return;
	}

	let allSessions: FileSession[] = [];
	for (const sessions of finalizedSessions.values()) {
		allSessions = allSessions.concat(sessions);
	}

	if (allSessions.length === 0) {
		vscode.window.showInformationMessage('No activity to sync.');
		return;
	}

	const markdown = generateMarkdownLog(allSessions);
	const now = new Date();
	const filePath = `activity-log-${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.md`;

	try {
		await commitMarkdownFileToGitHub(token, githubOwner, githubRepo, filePath, markdown);
		vscode.window.showInformationMessage(`Activity log committed to GitHub: ${filePath}`);
		// Clear finalized sessions once synced
		finalizedSessions.clear();
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to sync with GitHub: ${err.message}`);
	}
}

export function activate(context: vscode.ExtensionContext) {
	const openListener = vscode.workspace.onDidOpenTextDocument((document) => {
		const filePath = document.uri.fsPath;
		if (shouldSkipFile(filePath)) {
			return;
		}
		const projectId = getCurrentProjectId();
		if (!projectsData.has(projectId)) {
			projectsData.set(projectId, new Map());
		}
		const projectMap = projectsData.get(projectId)!;

		projectMap.set(document.uri.toString(), {
			fileUri: document.uri.toString(),
			openedAt: new Date(),
			savesCount: 0
		});
	});
	context.subscriptions.push(openListener);

	const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
		const filePath = document.uri.fsPath;
		if (shouldSkipFile(filePath)) {
			return;
		}
		const projectId = getCurrentProjectId();
		const projectMap = projectsData.get(projectId);
		if (projectMap) {
			const session = projectMap.get(document.uri.toString());
			if (session) {
				session.savesCount += 1;
			}
		}
	});
	context.subscriptions.push(saveListener);

	const closeListener = vscode.workspace.onDidCloseTextDocument((document) => {
		const filePath = document.uri.fsPath;
		if (shouldSkipFile(filePath)) {
			return;
		}
		const projectId = getCurrentProjectId();
		const projectMap = projectsData.get(projectId);
		if (projectMap) {
			const session = projectMap.get(document.uri.toString());
			if (session) {
				session.closedAt = new Date();
				finalizeSession(projectId, session);
				projectMap.delete(document.uri.toString());
			}
		}
	});
	context.subscriptions.push(closeListener);

	const fiveMinutes = syncFrequencyInMinutes * 60 * 1000;
	const intervalId = setInterval(() => {
		console.log("Periodic sync triggered.");
		syncWithGitHub(context);
	}, fiveMinutes);

	context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
}

export function deactivate(context: vscode.ExtensionContext) {
	// Force-close any open sessions if needed
	for (const [projectId, filesMap] of projectsData.entries()) {
		for (const session of filesMap.values()) {
			session.closedAt = new Date(); // closing at shutdown time
			finalizeSession(projectId, session);
		}
		filesMap.clear();
	}
	syncWithGitHub(context);
}
