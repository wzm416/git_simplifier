import * as vscode from "vscode";
import { SidebarProvider } from "./sidebarProvider";
import { RepoManager } from "./repoManager";
import { createBranchCommand } from "./commands/createBranch";
import { commitCommand, pushCommand } from "./commands/commitAndPush";
import { syncBranchCommand, resyncCommand } from "./commands/syncBranch";
import { switchBranchCommand } from "./commands/switchBranch";
import { removeBranchCommand } from "./commands/removeBranch";

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

  // Create Branch
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.createBranch", createBranchCommand(repoManager))
  );

  // Switch Branch
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.switchBranch", switchBranchCommand(repoManager))
  );

  // Sync Branch with Remote Master
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.syncBranch", syncBranchCommand(repoManager))
  );

  // Re-sync after conflict resolution
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.resync", resyncCommand(repoManager))
  );

  // Commit (no auto-push)
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.commit", commitCommand(repoManager))
  );

  // Push with commit preview
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.push", pushCommand(repoManager))
  );

  // Remove Branch
  context.subscriptions.push(
    vscode.commands.registerCommand("gitSimplifier.removeBranch", removeBranchCommand(repoManager))
  );

  console.log("Git Simplifier is now active!");
}

export function deactivate() {}
