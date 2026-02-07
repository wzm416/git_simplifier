import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { gitExec } from "./gitUtils";

/**
 * Manages which git repository the extension operates on.
 * Auto-scans the workspace for git repos, lets the user pick one,
 * and remembers the selection.
 */
export class RepoManager {
  private _selectedRepo: string | undefined;
  private _onDidChangeRepo = new vscode.EventEmitter<string | undefined>();
  private _onDidGitChange = new vscode.EventEmitter<void>();

  /** Fires when the selected repo changes. */
  public readonly onDidChangeRepo = this._onDidChangeRepo.event;

  /** Fires when a command modifies git state (branch, commit, etc). */
  public readonly onDidGitChange = this._onDidGitChange.event;

  /** Call this from any command after it modifies git state. */
  public notifyGitChange(): void {
    this._onDidGitChange.fire();
  }

  constructor(private readonly _context: vscode.ExtensionContext) {
    // Restore last selection from workspace state
    this._selectedRepo = this._context.workspaceState.get<string>("selectedRepo");
  }

  /** The currently selected repo root, or undefined if none selected. */
  get selectedRepo(): string | undefined {
    return this._selectedRepo;
  }

  /**
   * Get the selected repo. If none is selected yet, auto-scan and prompt.
   * This is what all commands should call.
   */
  async getRepoRoot(): Promise<string> {
    if (this._selectedRepo) {
      // Verify it's still a valid git repo
      try {
        await gitExec(["rev-parse", "--show-toplevel"], this._selectedRepo);
        return this._selectedRepo;
      } catch {
        // Repo no longer valid, clear selection
        this._selectedRepo = undefined;
        await this._context.workspaceState.update("selectedRepo", undefined);
      }
    }

    // No repo selected — scan and prompt
    return this.selectRepo();
  }

  /**
   * Scan the workspace for git repos and let the user pick one.
   * Can also be called explicitly to switch repos.
   */
  async selectRepo(): Promise<string> {
    const repos = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Scanning for git repositories..." },
      () => this._scanForRepos()
    );

    if (repos.length === 0) {
      throw new Error("No git repositories found in the workspace.");
    }

    // Build Quick Pick items with folder name + full path
    const items = repos.map((repoPath) => ({
      label: `$(repo) ${path.basename(repoPath)}`,
      description: repoPath,
      repoPath,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a git repository to work with",
      matchOnDescription: true,
    });

    if (!selected) {
      throw new Error("No repository selected.");
    }

    // Save the selection
    this._selectedRepo = selected.repoPath;
    await this._context.workspaceState.update("selectedRepo", selected.repoPath);
    this._onDidChangeRepo.fire(selected.repoPath);

    vscode.window.showInformationMessage(`📂 Working on: ${path.basename(selected.repoPath)}`);
    return selected.repoPath;
  }

  /**
   * Scan workspace folders and their immediate subdirectories for git repos.
   */
  private async _scanForRepos(): Promise<string[]> {
    const found: string[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return found;
    }

    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;

      // Check if the workspace folder itself is a git repo
      await this._tryAddRepo(folderPath, found);

      // Scan immediate subdirectories (1 level deep)
      try {
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
            const subPath = path.join(folderPath, entry.name);
            await this._tryAddRepo(subPath, found);
          }
        }
      } catch {
        // Can't read directory, skip
      }
    }

    return found;
  }

  /**
   * Try to detect if a directory is a git repo root and add it to the list.
   */
  private async _tryAddRepo(dir: string, found: string[]): Promise<void> {
    try {
      const root = await gitExec(["rev-parse", "--show-toplevel"], dir);
      if (root && !found.includes(root)) {
        found.push(root);
      }
    } catch {
      // Not a git repo
    }
  }
}
