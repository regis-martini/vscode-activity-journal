import * as vscode from 'vscode';

const config = vscode.workspace.getConfiguration('activityJournal');
const backendUrl = config.get<string>('backendUrl');
const enableLogging = config.get<boolean>('enableLogging');
const syncFrequencyInMinutes = config.get<number>('syncFrequencyInMinutes') ?? 5;
let activityBuffer: Array<{ timestamp: Date; action: string; fileName?: string }> = [];

console.log(`Loaded config: backendUrl=${backendUrl}, enableLogging=${enableLogging}, syncFrequencyInMinutes=${syncFrequencyInMinutes}`);


export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "vscode-activity-journal" is now active!');

	const openListener = vscode.workspace.onDidOpenTextDocument((document) => {
		// For now, just log to the console. Later, this will be saved to an in-memory store.
		console.log(`Opened: ${document.fileName}`);
		activityBuffer.push({ timestamp: new Date(), action: 'opened', fileName: document.fileName });
	});
	context.subscriptions.push(openListener);

	const saveListener = vscode.workspace.onDidSaveTextDocument((document) => {
		console.log(`Saved: ${document.fileName}`);
		activityBuffer.push({ timestamp: new Date(), action: 'saved', fileName: document.fileName });
	});
	context.subscriptions.push(saveListener);

	const closeListener = vscode.workspace.onDidCloseTextDocument((document) => {
		console.log(`Closed: ${document.fileName}`);
		activityBuffer.push({ timestamp: new Date(), action: 'closed', fileName: document.fileName });
	});
	context.subscriptions.push(closeListener);

	async function syncWithBackend() {
		console.log("Attempting sync...");
		try {
			if (activityBuffer.length === 0) {
				vscode.window.showInformationMessage('No activities to sync.');
				return;
			}

			// For now, just print them and clear the buffer.
			// Later, we'll send them to backend.
			console.log(`Syncing ${activityBuffer.length} activities:`, activityBuffer);
			activityBuffer = [];
			vscode.window.showInformationMessage('Activities synced (placeholder).');
		} catch (err) {
			console.error("Sync failed:", err);
		}
	}

	// Setup a periodic task every 5 minutes (300,000 ms)
	const fiveMinutes = syncFrequencyInMinutes * 60 * 1000;
	const intervalId = setInterval(() => {
		console.log("Periodic sync triggered.");
		syncWithBackend(); // call your sync function here
	}, fiveMinutes);

	// Make sure to clear it on deactivate
	context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
}

// This method is called when your extension is deactivated
export function deactivate() { }
