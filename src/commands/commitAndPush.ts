import * as vscode from "vscode";
import { gitExec, getCurrentBranch } from "../gitUtils";
import { RepoManager } from "../repoManager";

/**
 * Commit & Push command:
 *  1. Detect the current branch
 *  2. Show a summary of changed files
 *  3. Let user choose which files to stage (or stage all)
 *  4. Ask for a commit message
 *  5. Commit
 *  6. Push to remote (auto-create upstream if first push)
 */
export function commitAndPushCommand(repoManager: RepoManager) {
  return async (): Promise<void> => {
    try {
      const repoRoot = await repoManager.getRepoRoot();
      const branch = await getCurrentBranch(repoRoot);

      // 1. Check for changes
      const status = await gitExec(["status", "--porcelain"], repoRoot);
      if (!status) {
        vscode.window.showInformationMessage("No changes to commit — working tree is clean.");
        return;
      }

      // 2. Show changed files and let user decide what to stage
      const files = status
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const statusCode = line.substring(0, 2).trim();
          const filePath = line.substring(3);
          return { statusCode, filePath };
        });

      // Show summary and ask to proceed
      const stagedFiles = await gitExec(["diff", "--cached", "--name-only"], repoRoot);
      const hasStagedFiles = stagedFiles.trim().length > 0;

      const stageOption = await vscode.window.showQuickPick(
        [
          {
            label: "$(check-all) Stage all changes and commit",
            description: `${files.length} file(s) changed`,
            detail: files.map((f) => `  ${f.statusCode} ${f.filePath}`).join("\n"),
            action: "all",
          },
          ...(hasStagedFiles
            ? [
                {
                  label: "$(check) Commit only already-staged files",
                  description: `Files already in staging area`,
                  detail: stagedFiles,
                  action: "staged",
                },
              ]
            : []),
          {
            label: "$(list-selection) Pick files to stage",
            description: "Select individual files",
            action: "pick",
          },
        ],
        {
          placeHolder: `Commit & Push to '${branch}' — what to include?`,
        }
      );

      if (!stageOption) {
        return; // user cancelled
      }

      // 3. Stage files based on choice
      if (stageOption.action === "all") {
        await gitExec(["add", "-A"], repoRoot);
      } else if (stageOption.action === "pick") {
        // Let user pick individual files
        const fileItems = files.map((f) => ({
          label: f.filePath,
          description: formatStatusCode(f.statusCode),
          picked: true, // default all selected
        }));

        const selected = await vscode.window.showQuickPick(fileItems, {
          canPickMany: true,
          placeHolder: "Select files to stage (uncheck to exclude)",
        });

        if (!selected || selected.length === 0) {
          vscode.window.showWarningMessage("No files selected — commit cancelled.");
          return;
        }

        // Stage only selected files
        const filePaths = selected.map((s) => s.label);
        await gitExec(["add", "--", ...filePaths], repoRoot);
      }
      // "staged" action: don't stage anything new, use what's already staged

      // 4. Ask for commit message
      const commitMessage = await vscode.window.showInputBox({
        prompt: `Commit message for branch '${branch}'`,
        placeHolder: "feat: describe your changes",
        validateInput: (value) => {
          if (!value || !value.trim()) {
            return "Commit message cannot be empty";
          }
          return null;
        },
      });

      if (!commitMessage) {
        return; // user cancelled
      }

      // 5. Commit
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Committing..." },
        async () => {
          await gitExec(["commit", "-m", commitMessage], repoRoot);
        }
      );

      // 6. Push to remote
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Pushing '${branch}' to remote...` },
        async () => {
          // Check if upstream exists
          const hasUpstream = await checkUpstreamExists(repoRoot, branch);
          if (hasUpstream) {
            await gitExec(["push"], repoRoot);
          } else {
            // First push — create upstream tracking branch
            await gitExec(["push", "-u", "origin", branch], repoRoot);
          }
        }
      );

      vscode.window.showInformationMessage(
        `✅ Committed and pushed '${branch}' to remote!`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Commit & Push failed: ${err.message}`);
    }
  };
}

/**
 * Check if the current branch has an upstream tracking branch.
 */
async function checkUpstreamExists(repoRoot: string, branch: string): Promise<boolean> {
  try {
    await gitExec(["rev-parse", "--abbrev-ref", `${branch}@{upstream}`], repoRoot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format a git status code into a human-readable label.
 */
function formatStatusCode(code: string): string {
  switch (code) {
    case "M":
      return "Modified";
    case "A":
      return "Added";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    case "C":
      return "Copied";
    case "??":
      return "Untracked";
    case "AM":
      return "Added + Modified";
    case "MM":
      return "Modified (staged + unstaged)";
    default:
      return code;
  }
}
