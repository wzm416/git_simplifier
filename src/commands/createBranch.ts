import * as vscode from "vscode";
import * as path from "path";
import {
  gitExec,
  getLocalBranches,
  getRemoteBranches,
  getDefaultRemoteBranch,
} from "../gitUtils";
import { RepoManager } from "../repoManager";

/**
 * The three ways to create a new branch:
 *  1. From origin/master — fully synced with remote master
 *  2. From a local branch — new branch based on an existing local branch
 *  3. Clone a remote branch — checkout a remote branch as-is
 */
enum CreateMode {
  FromOriginMaster = "Create from origin/master",
  FromLocalBranch = "Create from a local branch",
  CloneRemoteBranch = "Clone a remote branch",
}

/**
 * Get the directory where worktrees are stored.
 * Worktrees live in a sibling folder: <repo>-worktrees/
 * e.g., if repo is /code/myproject, worktrees go in /code/myproject-worktrees/
 */
function getWorktreeBaseDir(repoRoot: string): string {
  const repoName = path.basename(repoRoot);
  return path.join(path.dirname(repoRoot), `${repoName}-worktrees`);
}

export function createBranchCommand(repoManager: RepoManager) {
  return async (): Promise<void> => {
    try {
      // 1. Get the repo root from RepoManager (auto-scans & prompts if needed)
      const repoRoot = await repoManager.getRepoRoot();

      // 2. Ask which mode to use
      const mode = await vscode.window.showQuickPick(
        [
          {
            label: CreateMode.FromOriginMaster,
            description: "New branch fully synced with remote master",
            detail: "Fetches latest origin/master and creates a branch from it",
          },
          {
            label: CreateMode.FromLocalBranch,
            description: "New branch based on an existing local branch",
            detail: "The new branch starts from the selected local branch",
          },
          {
            label: CreateMode.CloneRemoteBranch,
            description: "Checkout a remote branch locally",
            detail: "Useful for reproducing bugs at a specific version",
          },
        ],
        { placeHolder: "How do you want to create the branch?" }
      );

      if (!mode) {
        return; // user cancelled
      }

      let baseBranch: string;
      let newBranchName: string | undefined;

      switch (mode.label) {
        case CreateMode.FromOriginMaster: {
          // Fetch latest from origin and detect default branch (master or main)
          await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "Fetching from origin..." },
            async () => gitExec(["fetch", "origin"], repoRoot)
          );
          baseBranch = await getDefaultRemoteBranch(repoRoot);

          // Ask for new branch name
          newBranchName = await vscode.window.showInputBox({
            prompt: "Enter the new branch name",
            placeHolder: "feature/my-new-feature",
            validateInput: (value) => {
              if (!value || !value.trim()) {
                return "Branch name cannot be empty";
              }
              if (/\s/.test(value)) {
                return "Branch name cannot contain spaces";
              }
              return null;
            },
          });
          break;
        }

        case CreateMode.FromLocalBranch: {
          // List local branches for user to pick
          const localBranches = await getLocalBranches(repoRoot);
          if (localBranches.length === 0) {
            vscode.window.showWarningMessage("No local branches found.");
            return;
          }

          const selectedBranch = await vscode.window.showQuickPick(localBranches, {
            placeHolder: "Select a local branch to base the new branch on",
          });
          if (!selectedBranch) {
            return;
          }
          baseBranch = selectedBranch;

          // Ask for new branch name
          newBranchName = await vscode.window.showInputBox({
            prompt: `Enter the new branch name (based on ${baseBranch})`,
            placeHolder: "feature/my-new-feature",
            validateInput: (value) => {
              if (!value || !value.trim()) {
                return "Branch name cannot be empty";
              }
              if (/\s/.test(value)) {
                return "Branch name cannot contain spaces";
              }
              return null;
            },
          });
          break;
        }

        case CreateMode.CloneRemoteBranch: {
          // Fetch and list remote branches
          const remoteBranches = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: "Fetching remote branches..." },
            async () => getRemoteBranches(repoRoot)
          );

          if (remoteBranches.length === 0) {
            vscode.window.showWarningMessage("No remote branches found.");
            return;
          }

          const selectedRemote = await vscode.window.showQuickPick(remoteBranches, {
            placeHolder: "Select a remote branch to clone",
          });
          if (!selectedRemote) {
            return;
          }

          // Use the branch name without the remote prefix as local name
          // e.g., "origin/feature-x" → "feature-x"
          baseBranch = selectedRemote;
          const defaultName = selectedRemote.replace(/^[^/]+\//, "");

          newBranchName = await vscode.window.showInputBox({
            prompt: `Enter the local branch name (cloning ${selectedRemote})`,
            value: defaultName,
            placeHolder: defaultName,
            validateInput: (value) => {
              if (!value || !value.trim()) {
                return "Branch name cannot be empty";
              }
              if (/\s/.test(value)) {
                return "Branch name cannot contain spaces";
              }
              return null;
            },
          });
          break;
        }

        default:
          return;
      }

      if (!newBranchName) {
        return; // user cancelled
      }

      // 3. Create the worktree
      const worktreeBase = getWorktreeBaseDir(repoRoot);
      const worktreePath = path.join(worktreeBase, newBranchName.replace(/\//g, "-"));

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Creating worktree for '${newBranchName}'...`,
        },
        async () => {
          // git worktree add -b <new-branch> <path> <base-branch>
          await gitExec(
            ["worktree", "add", "-b", newBranchName!, worktreePath, baseBranch],
            repoRoot
          );
        }
      );

      // 4. Open a new Cursor/VS Code window at the worktree path
      const worktreeUri = vscode.Uri.file(worktreePath);
      await vscode.commands.executeCommand("vscode.openFolder", worktreeUri, { forceNewWindow: true });

      repoManager.notifyGitChange();
      vscode.window.showInformationMessage(
        `✅ Branch '${newBranchName}' created and opened in a new window!`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to create branch: ${err.message}`);
    }
  };
}
