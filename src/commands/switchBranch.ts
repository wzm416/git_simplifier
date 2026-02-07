import * as vscode from "vscode";
import { gitExec, getLocalBranches, getWorktrees, getCurrentBranch } from "../gitUtils";
import { RepoManager } from "../repoManager";

/**
 * Switch Branch command:
 *  1. List all local branches + worktrees
 *  2. If the target branch has a worktree, open it in a new window
 *  3. If not, checkout the branch in the current repo directory
 */
export function switchBranchCommand(repoManager: RepoManager) {
  return async (): Promise<void> => {
    try {
      const repoRoot = await repoManager.getRepoRoot();
      const currentBranch = await getCurrentBranch(repoRoot);

      // Get worktrees and local branches
      const worktrees = await getWorktrees(repoRoot);
      const localBranches = await getLocalBranches(repoRoot);
      const worktreeBranches = worktrees.map((wt) => wt.branch);

      // Build QuickPick items
      const items: {
        label: string;
        description: string;
        branch: string;
        worktreePath: string | null;
      }[] = [];

      for (const branch of localBranches) {
        const isCurrent = branch === currentBranch;
        const worktree = worktrees.find((wt) => wt.branch === branch);

        if (worktree) {
          items.push({
            label: `${isCurrent ? "$(check) " : "$(git-branch) "}${branch}`,
            description: worktree.path === repoRoot
              ? isCurrent ? "← current (main worktree)" : "(main worktree)"
              : isCurrent ? `← current (worktree: ${worktree.path})` : `worktree: ${worktree.path}`,
            branch,
            worktreePath: worktree.path,
          });
        } else {
          items.push({
            label: `$(git-branch) ${branch}`,
            description: "(no worktree — will checkout in main repo)",
            branch,
            worktreePath: null,
          });
        }
      }

      if (items.length === 0) {
        vscode.window.showWarningMessage("No local branches found.");
        return;
      }

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Current branch: ${currentBranch} — switch to…`,
      });

      if (!selected) {
        return;
      }

      if (selected.branch === currentBranch && selected.worktreePath === repoRoot) {
        vscode.window.showInformationMessage(`Already on '${currentBranch}'.`);
        return;
      }

      if (selected.worktreePath) {
        // Branch has a worktree — open it in a new window
        const folderUri = vscode.Uri.file(selected.worktreePath);

        if (selected.worktreePath === repoRoot) {
          // It's the main worktree, already here
          vscode.window.showInformationMessage(`Already in the main worktree for '${selected.branch}'.`);
        } else {
          await vscode.commands.executeCommand("vscode.openFolder", folderUri, {
            forceNewWindow: true,
          });
          vscode.window.showInformationMessage(
            `📂 Opened worktree for '${selected.branch}' in a new window.`
          );
        }
      } else {
        // No worktree — checkout in current directory
        // First check for uncommitted changes
        const status = await gitExec(["status", "--porcelain"], repoRoot);
        if (status.trim()) {
          const action = await vscode.window.showWarningMessage(
            `You have uncommitted changes. Switching to '${selected.branch}' may cause issues.`,
            "Switch Anyway (stash changes)",
            "Cancel"
          );

          if (action === "Switch Anyway (stash changes)") {
            await gitExec(["stash", "push", "-m", `auto-stash before switching to ${selected.branch}`], repoRoot);
            vscode.window.showInformationMessage("Changes stashed. Use `git stash pop` to restore them later.");
          } else {
            return;
          }
        }

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Switching to '${selected.branch}'...` },
          async () => {
            await gitExec(["checkout", selected.branch], repoRoot);
          }
        );

        vscode.window.showInformationMessage(`✅ Switched to branch '${selected.branch}'.`);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Switch branch failed: ${err.message}`);
    }
  };
}
