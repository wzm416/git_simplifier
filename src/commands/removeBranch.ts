import * as vscode from "vscode";
import { gitExec, getLocalBranches, getWorktrees, getCurrentBranch } from "../gitUtils";
import { RepoManager } from "../repoManager";

/**
 * Remove Local Branch command:
 *  1. List all local branches (mark worktree branches)
 *  2. Let user select one (or multiple) to delete
 *  3. Confirm deletion
 *  4. If branch has a worktree, remove the worktree first
 *  5. Delete the branch
 *  6. Optionally delete the remote tracking branch too
 */
export function removeBranchCommand(repoManager: RepoManager) {
  return async (): Promise<void> => {
    try {
      const repoRoot = await repoManager.getRepoRoot();
      const currentBranch = await getCurrentBranch(repoRoot);

      // Get branches and worktrees
      const localBranches = await getLocalBranches(repoRoot);
      const worktrees = await getWorktrees(repoRoot);

      // Filter out the current branch — can't delete the branch you're on
      const deletableBranches = localBranches.filter((b) => b !== currentBranch);

      if (deletableBranches.length === 0) {
        vscode.window.showInformationMessage(
          `No branches to remove. You're on '${currentBranch}' (the only branch).`
        );
        return;
      }

      // Build QuickPick items
      const items = deletableBranches.map((branch) => {
        const worktree = worktrees.find((wt) => wt.branch === branch);
        return {
          label: `$(git-branch) ${branch}`,
          description: worktree
            ? `worktree: ${worktree.path}`
            : "",
          detail: worktree
            ? "⚠️ Will also remove the worktree directory"
            : undefined,
          branch,
          worktreePath: worktree?.path || null,
          picked: false,
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: `Select branch(es) to remove (current: ${currentBranch})`,
      });

      if (!selected || selected.length === 0) {
        return;
      }

      // Confirm deletion
      const branchNames = selected.map((s) => s.branch).join(", ");
      const worktreeCount = selected.filter((s) => s.worktreePath).length;

      let confirmMessage = `Delete ${selected.length} branch(es): ${branchNames}?`;
      if (worktreeCount > 0) {
        confirmMessage += `\n\n⚠️ ${worktreeCount} worktree director${worktreeCount === 1 ? "y" : "ies"} will also be removed.`;
      }

      const confirm = await vscode.window.showWarningMessage(
        confirmMessage,
        { modal: true },
        "Delete",
        "Delete + Remove Remote"
      );

      if (!confirm) {
        return;
      }

      const deleteRemote = confirm === "Delete + Remove Remote";

      // Process each branch
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Removing branches...",
          cancellable: false,
        },
        async (progress) => {
          for (let i = 0; i < selected.length; i++) {
            const item = selected[i];
            progress.report({
              message: `(${i + 1}/${selected.length}) ${item.branch}`,
              increment: (100 / selected.length),
            });

            try {
              // 1. Remove worktree if it exists
              if (item.worktreePath) {
                await gitExec(["worktree", "remove", item.worktreePath, "--force"], repoRoot);
              }

              // 2. Delete the local branch
              await gitExec(["branch", "-D", item.branch], repoRoot);

              // 3. Optionally delete the remote branch
              if (deleteRemote) {
                try {
                  await gitExec(["push", "origin", "--delete", item.branch], repoRoot);
                } catch {
                  // Remote branch might not exist — that's fine
                }
              }
            } catch (err: any) {
              vscode.window.showWarningMessage(
                `Failed to remove '${item.branch}': ${err.message}`
              );
            }
          }
        }
      );

      vscode.window.showInformationMessage(
        `✅ Removed ${selected.length} branch(es): ${branchNames}`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Remove branch failed: ${err.message}`);
    }
  };
}
