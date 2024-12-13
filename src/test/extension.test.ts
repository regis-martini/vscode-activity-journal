import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
 import * as myExtension from '../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('getCurrentProjectId returns correct project ID', () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const expectedProjectId = workspaceFolders ? workspaceFolders[0].uri.toString() : "no-root";
		assert.strictEqual(myExtension.getCurrentProjectId(), expectedProjectId);
	});

	test('getCurrentProjectId returns "no-root" when no workspace folders are open', () => {
		const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
		(vscode.workspace as any).workspaceFolders = undefined;
		assert.strictEqual(myExtension.getCurrentProjectId(), "no-root");
		(vscode.workspace as any).workspaceFolders = originalWorkspaceFolders;
	});
});
