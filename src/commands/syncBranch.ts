import * as vscode from "vscode";
import {
  gitExec,
  getLocalBranches,
  getWorktrees,
  getDefaultRemoteBranch,
} from "../gitUtils";
import { RepoManager } from "../repoManager";

/**
 * Sync Branch with Remote Master:
 *  1. Let user select which local branch to sync
 *  2. Fetch latest from origin
 *  3. Merge origin/master (or origin/main) into the selected branch
 *  4. If no conflicts → auto-commit and show success
 *  5. If conflicts → open the worktree in a new window for manual resolution,
 *     and provide a "Re-sync" command to finalize after conflicts are resolved
 */
export function syncBranchCommand(repoManager: RepoManager) {
  return async (): Promise<void> => {
    try {
      const repoRoot = await repoManager.getRepoRoot();

      // 1. Fetch latest from origin
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Fetching from origin..." },
        async () => gitExec(["fetch", "origin"], repoRoot)
      );

      // 2. Detect default remote branch (master or main)
      const defaultRemote = await getDefaultRemoteBranch(repoRoot);

      // 3. Build a list of branches the user can sync
      //    Include worktree branches (with their paths) and other local branches
      const worktrees = await getWorktrees(repoRoot);
      const localBranches = await getLocalBranches(repoRoot);

      const branchItems: { label: string; description: string; branch: string; worktreePath: string | null }[] = [];

      // Add worktree branches first (they have dedicated directories)
      for (const wt of worktrees) {
        branchItems.push({
          label: `$(git-branch) ${wt.branch}`,
          description: wt.path === repoRoot ? "(main worktree)" : `worktree: ${wt.path}`,
          branch: wt.branch,
          worktreePath: wt.path,
        });
      }

      // Add local branches that don't have a worktree
      const worktreeBranches = worktrees.map((wt) => wt.branch);
      for (const branch of localBranches) {
        if (!worktreeBranches.includes(branch)) {
          branchItems.push({
            label: `$(git-branch) ${branch}`,
            description: "(no worktree — will sync in main repo)",
            branch,
            worktreePath: null,
          });
        }
      }

      if (branchItems.length === 0) {
        vscode.window.showWarningMessage("No local branches found to sync.");
        return;
      }

      // 4. Let user pick which branch to sync
      const selected = await vscode.window.showQuickPick(branchItems, {
        placeHolder: `Select a branch to sync with ${defaultRemote}`,
      });

      if (!selected) {
        return; // user cancelled
      }

      // 5. Determine the working directory for the merge
      const cwd = selected.worktreePath || repoRoot;
      const branch = selected.branch;

      // Make sure we're on the right branch in that directory
      const currentBranch = (await gitExec(["rev-parse", "--abbrev-ref", "HEAD"], cwd)).trim();
      if (currentBranch !== branch) {
        // For non-worktree branches, we need to checkout first
        if (!selected.worktreePath) {
          await gitExec(["checkout", branch], cwd);
        } else {
          // Worktree should already be on the correct branch
          vscode.window.showErrorMessage(
            `Worktree at ${cwd} is on '${currentBranch}', expected '${branch}'.`
          );
          return;
        }
      }

      // 6. Attempt the merge
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Syncing '${branch}' with ${defaultRemote}...`,
          },
          async () => {
            await gitExec(["merge", defaultRemote, "--no-edit"], cwd);
          }
        );

        // Merge succeeded — no conflicts!
        repoManager.notifyGitChange();
        vscode.window.showInformationMessage(
          `✅ Sync success! Branch '${branch}' is now up to date with ${defaultRemote}.`
        );
      } catch (mergeErr: any) {
        // 7. Merge failed — likely conflicts
        const hasConflicts = await checkForConflicts(cwd);

        if (hasConflicts) {
          // Show conflict notification with action buttons
          const action = await vscode.window.showWarningMessage(
            `⚠️ Merge conflicts detected in '${branch}'! Please resolve them.`,
            { modal: false },
            "Open in New Window",
            "Abort Merge"
          );

          if (action === "Open in New Window") {
            // Open the worktree/repo in a new window for conflict resolution
            const folderUri = vscode.Uri.file(cwd);
            await vscode.commands.executeCommand("vscode.openFolder", folderUri, {
              forceNewWindow: true,
            });

            vscode.window.showInformationMessage(
              `Resolve conflicts in the new window, then use "Git Simplifier: Re-sync after conflict resolution" to finalize.`
            );
          } else if (action === "Abort Merge") {
            await gitExec(["merge", "--abort"], cwd);
            vscode.window.showInformationMessage(`Merge aborted for '${branch}'.`);
          }
          // If user dismisses, conflicts remain — they can re-sync later
        } else {
          // Some other merge error (not conflicts)
          vscode.window.showErrorMessage(`Merge failed: ${mergeErr.message}`);
        }
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Sync failed: ${err.message}`);
    }
  };
}

/**
 * Re-sync command: after the user resolves conflicts manually,
 * this stages everything and commits the merge.
 */
export function resyncCommand(repoManager: RepoManager) {
  return async (): Promise<void> => {
    try {
      const repoRoot = await repoManager.getRepoRoot();

      // Determine working directory — use current workspace if it's a worktree
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const cwd = workspaceFolders ? workspaceFolders[0].uri.fsPath : repoRoot;

      // Check if there's a merge in progress
      const isMerging = await isMergeInProgress(cwd);
      if (!isMerging) {
        vscode.window.showInformationMessage("No merge in progress — nothing to re-sync.");
        return;
      }

      // Check if there are still unresolved conflicts
      const hasConflicts = await checkForConflicts(cwd);
      if (hasConflicts) {
        const conflictFiles = await getConflictFiles(cwd);
        vscode.window.showWarningMessage(
          `⚠️ There are still unresolved conflicts:\n${conflictFiles.join(", ")}\n\nPlease resolve them before re-syncing.`
        );
        return;
      }

      // All conflicts resolved — stage and commit
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Finalizing merge..." },
        async () => {
          await gitExec(["add", "-A"], cwd);
          await gitExec(["commit", "--no-edit"], cwd);
        }
      );

      const branch = await gitExec(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      vscode.window.showInformationMessage(
        `✅ Re-sync complete! Branch '${branch}' merge has been committed.`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Re-sync failed: ${err.message}`);
    }
  };
}

/**
 * Check if there are unresolved merge conflicts.
 */
async function checkForConflicts(cwd: string): Promise<boolean> {
  try {
    const output = await gitExec(["diff", "--name-only", "--diff-filter=U"], cwd);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get the list of files with conflicts.
 */
async function getConflictFiles(cwd: string): Promise<string[]> {
  try {
    const output = await gitExec(["diff", "--name-only", "--diff-filter=U"], cwd);
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if a merge is currently in progress.
 */
async function isMergeInProgress(cwd: string): Promise<boolean> {
  try {
    // MERGE_HEAD exists during an active merge
    await gitExec(["rev-parse", "--verify", "MERGE_HEAD"], cwd);
    return true;
  } catch {
    return false;
  }
}
