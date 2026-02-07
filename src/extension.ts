import * as vscode from "vscode";
import { SidebarProvider } from "./sidebarProvider";
import { RepoManager } from "./repoManager";
import { createBranchCommand } from "./commands/createBranch";
import { commitAndPushCommand } from "./commands/commitAndPush";
import { syncBranchCommand, resyncCommand } from "./commands/syncBranch";

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

  // Step 3: Sync Branch with Remote Master (implemented)
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.syncBranch", syncBranchCommand(repoManager))
  );

  // Step 3b: Re-sync after conflict resolution
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.resync", resyncCommand(repoManager))
  );

  // Step 4: Commit & Push (implemented)
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.commitAndPush", commitAndPushCommand(repoManager))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.removeBranch", async () => {
      vscode.window.showInformationMessage("Remove Branch — coming in Step 5!");
    })
  );

  console.log("Git Simplifier is now active!");
}

export function deactivate() {}
