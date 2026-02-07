import * as vscode from "vscode";
import { SidebarProvider } from "./sidebarProvider";
import { RepoManager } from "./repoManager";
import { createBranchCommand } from "./commands/createBranch";

export function activate(context: vscode.ExtensionContext) {
  // Create the central RepoManager (auto-scans, persists selection)
  const repoManager = new RepoManager(context);

  // Register the sidebar webview (pass repoManager so it can show selected repo)
  const sidebarProvider = new SidebarProvider(context.extensionUri, repoManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );

  // Select / switch repository
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.selectRepo", async () => {
      try {
        await repoManager.selectRepo();
      } catch (err: any) {
        vscode.window.showErrorMessage(err.message);
      }
    })
  );

  // Step 2: Create Branch (implemented)
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.createBranch", createBranchCommand(repoManager))
  );

  // Placeholders for later steps
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.syncBranch", async () => {
      vscode.window.showInformationMessage("Sync Branch — coming in Step 3!");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.commitAndPush", async () => {
      vscode.window.showInformationMessage("Commit & Push — coming in Step 4!");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.removeBranch", async () => {
      vscode.window.showInformationMessage("Remove Branch — coming in Step 5!");
    })
  );

  console.log("Git Simplifier is now active!");
}

export function deactivate() {}
