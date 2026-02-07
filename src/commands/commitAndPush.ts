import * as vscode from "vscode";
import { gitExec, getCurrentBranch } from "../gitUtils";
import { RepoManager } from "../repoManager";

/**
 * Commit command (no auto-push):
 *  1. Detect the current branch
 *  2. Show a summary of changed files
 *  3. Let user choose which files to stage (or stage all)
 *  4. Ask for a commit message
 *  5. Commit
 *  6. Ask if user wants to push now
 */
export function commitCommand(repoManager: RepoManager) {
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
          placeHolder: `Commit on '${branch}' — what to include?`,
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

      // 6. Ask user if they want to push
      const pushNow = await vscode.window.showInformationMessage(
        `✅ Committed on '${branch}'. Push to remote?`,
        "Push Now",
        "Later"
      );

      if (pushNow === "Push Now") {
        await vscode.commands.executeCommand("gitSimplifier.push");
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Commit failed: ${err.message}`);
    }
  };
}

/**
 * Push command:
 *  1. Show unpushed commits for the current branch
 *  2. Let user confirm
 *  3. Push (auto-create upstream if first push)
 */
export function pushCommand(repoManager: RepoManager) {
  return async (): Promise<void> => {
    try {
      const repoRoot = await repoManager.getRepoRoot();
      const branch = await getCurrentBranch(repoRoot);

      // 1. Check if there's an upstream
      const hasUpstream = await checkUpstreamExists(repoRoot, branch);

      // 2. Get unpushed commits
      let unpushedCommits: string[] = [];
      if (hasUpstream) {
        const log = await gitExec(
          ["log", `origin/${branch}..HEAD`, "--oneline"],
          repoRoot
        );
        unpushedCommits = log.split("\n").filter(Boolean);
      } else {
        // No upstream — all commits are "unpushed"
        const log = await gitExec(["log", "--oneline"], repoRoot);
        unpushedCommits = log.split("\n").filter(Boolean);
      }

      if (unpushedCommits.length === 0) {
        vscode.window.showInformationMessage("Nothing to push — already up to date with remote.");
        return;
      }

      // 3. Show commits and ask for confirmation
      const commitItems = unpushedCommits.map((line) => {
        const spaceIdx = line.indexOf(" ");
        const hash = line.substring(0, spaceIdx);
        const message = line.substring(spaceIdx + 1);
        return {
          label: `$(git-commit) ${message}`,
          description: hash,
        };
      });

      const upstreamNote = hasUpstream
        ? `Push ${unpushedCommits.length} commit(s) to origin/${branch}`
        : `First push — will create origin/${branch}`;

      // Add a header item showing the summary
      const confirmItems = [
        {
          label: `$(cloud-upload) ${upstreamNote}`,
          description: "Confirm to push",
          kind: vscode.QuickPickItemKind.Separator,
        } as any,
        ...commitItems,
      ];

      // Use showQuickPick to display commits, with a confirm action
      const confirm = await vscode.window.showQuickPick(
        [
          {
            label: `$(rocket) Push ${unpushedCommits.length} commit(s) to remote`,
            description: hasUpstream ? `origin/${branch}` : `(will create origin/${branch})`,
            detail: unpushedCommits.map((c) => `  ${c}`).join("\n"),
            action: "push",
          },
          {
            label: "$(close) Cancel",
            description: "",
            action: "cancel",
          },
        ],
        {
          placeHolder: `${unpushedCommits.length} unpushed commit(s) on '${branch}'`,
        }
      );

      if (!confirm || confirm.action === "cancel") {
        return;
      }

      // 4. Push
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Pushing '${branch}' to remote...` },
        async () => {
          if (hasUpstream) {
            await gitExec(["push"], repoRoot);
          } else {
            await gitExec(["push", "-u", "origin", branch], repoRoot);
          }
        }
      );

      vscode.window.showInformationMessage(
        `✅ Pushed ${unpushedCommits.length} commit(s) on '${branch}' to remote!`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Push failed: ${err.message}`);
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
