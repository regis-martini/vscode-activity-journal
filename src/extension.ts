// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const config = vscode.workspace.getConfiguration('activityJournal');
const backendUrl = config.get<string>('backendUrl');
const enableLogging = config.get<boolean>('enableLogging');
console.log(`Loaded config: backendUrl=${backendUrl}, enableLogging=${enableLogging}`);
let activityBuffer: Array<{ timestamp: Date; action: string; fileName?: string }> = [];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
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

	const forceSyncCommand = vscode.commands.registerCommand('activityJournal.forceSync', () => {
		vscode.window.showInformationMessage('Forcing sync...');
		if (activityBuffer.length === 0) {
            vscode.window.showInformationMessage('No activities to sync.');
            return;
        }

        // For now, just print them and clear the buffer.
        // Later, we'll send them to backend.
        console.log(`Syncing ${activityBuffer.length} activities:`, activityBuffer);
        activityBuffer = [];
        vscode.window.showInformationMessage('Activities synced (placeholder).');
	});
	context.subscriptions.push(forceSyncCommand);
}

// This method is called when your extension is deactivated
export function deactivate() { }
