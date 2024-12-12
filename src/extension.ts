import * as vscode from 'vscode';

const config = vscode.workspace.getConfiguration('activityJournal');
const backendUrl = config.get<string>('backendUrl');
const enableLogging = config.get<boolean>('enableLogging');
const DEFAULT_SYNC_FREQUENCY = 5;
const syncFrequencyInMinutes = config.get<number>('syncFrequencyInMinutes') ?? DEFAULT_SYNC_FREQUENCY;
interface FileSession {
	fileUri: string;
	openedAt: Date;
	closedAt?: Date;
	savesCount: number;
	// Possibly track other stats like # of changes or save intervals
}

// A per-project map: projectId -> fileUri -> FileSession
let projectsData: Map<string, Map<string, FileSession>> = new Map();
// projectId -> array of concluded sessions
let finalizedSessions: Map<string, FileSession[]> = new Map();

console.log(`Loaded config: backendUrl=${backendUrl}, enableLogging=${enableLogging}, syncFrequencyInMinutes=${syncFrequencyInMinutes}`);

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

async function syncWithBackend() {
	console.log("Attempting sync...");
	// Gather all concluded sessions from all projects
	const dataToSend = Array.from(finalizedSessions.entries()).map(([projectId, sessions]) => ({
		projectId,
		sessions
	}));

	if (dataToSend.length === 0) {
		vscode.window.showInformationMessage('No activities to sync.');
		return;
	}

	// Send dataToSend to backend
	// Upon successful send, clear finalizedSessions
	// Or remove only sessions that were successfully sent
	try {
		// send dataToSend to backend
		// e.g. await fetch(backendUrl, { method: 'POST', body: JSON.stringify(dataToSend) });
		console.log("Synced data:", dataToSend);
		// If success:
		finalizedSessions.clear();
	} catch (err) {
		console.error("Sync error:", err);
		vscode.window.showInformationMessage('Sync error.');
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "vscode-activity-journal" is now active!');

	const openListener = vscode.workspace.onDidOpenTextDocument((document) => {
		// For now, just log to the console. Later, this will be saved to an in-memory store.
		console.log(`Opened: ${document.fileName}`);
		const projectId = getCurrentProjectId();
		console.log(`ProjectId: ${projectId}`);
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
		console.log(`Saved: ${document.fileName}`);
		const projectId = getCurrentProjectId();
		console.log(`ProjectId: ${projectId}`);
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
		const projectId = getCurrentProjectId();
		const projectMap = projectsData.get(projectId);
		if (projectMap) {
			const session = projectMap.get(document.uri.toString());
			console.log(`Session for file: ${session?.fileUri}`);
			if (session) {
				session.closedAt = new Date();
				// Move this session to a finalized list or mark it as ready to be synced.
				// E.g., keep a separate `finalizedSessions: Map<string, FileSession[]>` structure
				// Or store them separately right away.
				finalizeSession(projectId, session);
				projectMap.delete(document.uri.toString());
			}
		}
	});
	context.subscriptions.push(closeListener);

	// Setup a periodic task to sync with the backend
	const fiveMinutes = syncFrequencyInMinutes * 60 * 1000;
	const intervalId = setInterval(() => {
		console.log("Periodic sync triggered.");
		syncWithBackend();
	}, fiveMinutes);

	// Make sure to clear it on deactivate
	context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Force-close any open sessions if needed
	for (const [projectId, filesMap] of projectsData.entries()) {
		for (const session of filesMap.values()) {
			session.closedAt = new Date(); // closing at shutdown time
			finalizeSession(projectId, session);
		}
		filesMap.clear();
	}
	syncWithBackend();
}
