import * as vscode from "vscode";
import * as path from "path";
import { RepoManager } from "./repoManager";
import { gitExec, getCurrentBranch, getLocalBranches } from "./gitUtils";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gitSimplifierView";

  private _view?: vscode.WebviewView;
  private _watcher?: vscode.FileSystemWatcher;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _repoManager: RepoManager
  ) {
    // Refresh sidebar when repo selection changes
    this._repoManager.onDidChangeRepo(() => {
      this._setupGitWatcher();
      this._refreshView();
    });

    // Set up watcher for current repo if already selected
    this._setupGitWatcher();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml();
    this._refreshView();

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "selectRepo":
          vscode.commands.executeCommand("gitSimplifier.selectRepo");
          break;
        case "createBranch":
          vscode.commands.executeCommand("gitSimplifier.createBranch");
          break;
        case "syncBranch":
          vscode.commands.executeCommand("gitSimplifier.syncBranch");
          break;
        case "commitAndPush":
          vscode.commands.executeCommand("gitSimplifier.commitAndPush");
          break;
        case "removeBranch":
          vscode.commands.executeCommand("gitSimplifier.removeBranch");
          break;
        case "refresh":
          this._refreshView();
          break;
      }
    });

    // Refresh when the view becomes visible again
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._refreshView();
      }
    });
  }

  /**
   * Watch .git/HEAD and .git/index for changes.
   * HEAD changes when you switch branches.
   * index changes when files are staged/unstaged.
   */
  private _setupGitWatcher(): void {
    // Dispose old watcher
    if (this._watcher) {
      this._watcher.dispose();
      this._watcher = undefined;
    }

    const repo = this._repoManager.selectedRepo;
    if (!repo) {
      return;
    }

    // Watch .git/HEAD (branch changes) and .git/index (staging changes)
    const gitPattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(repo, ".git")),
      "{HEAD,index,refs/**}"
    );

    this._watcher = vscode.workspace.createFileSystemWatcher(gitPattern);
    this._watcher.onDidChange(() => this._refreshView());
    this._watcher.onDidCreate(() => this._refreshView());
  }

  /** Gather repo + branch info and push it to the webview. */
  private async _refreshView(): Promise<void> {
    if (!this._view) {
      return;
    }

    const repo = this._repoManager.selectedRepo;
    if (!repo) {
      this._view.webview.postMessage({
        type: "state",
        repoName: null,
        repoPath: null,
        currentBranch: null,
        branches: [],
        changedFiles: 0,
        unpushedCount: 0,
      });
      return;
    }

    try {
      const repoName = path.basename(repo);
      const branch = await getCurrentBranch(repo);
      const branches = await getLocalBranches(repo);

      // Count changed files
      let changedFiles = 0;
      try {
        const status = await gitExec(["status", "--porcelain"], repo);
        changedFiles = status ? status.split("\n").filter(Boolean).length : 0;
      } catch { /* ignore */ }

      // Count unpushed commits
      let unpushedCount = 0;
      try {
        const log = await gitExec(["log", `origin/${branch}..HEAD`, "--oneline"], repo);
        unpushedCount = log ? log.split("\n").filter(Boolean).length : 0;
      } catch {
        try {
          const log = await gitExec(["log", "--oneline"], repo);
          unpushedCount = log ? log.split("\n").filter(Boolean).length : 0;
        } catch { /* ignore */ }
      }

      this._view.webview.postMessage({
        type: "state",
        repoName,
        repoPath: repo,
        currentBranch: branch,
        branches,
        changedFiles,
        unpushedCount,
      });
    } catch {
      this._view.webview.postMessage({
        type: "state",
        repoName: path.basename(repo),
        repoPath: repo,
        currentBranch: null,
        branches: [],
        changedFiles: 0,
        unpushedCount: 0,
      });
    }
  }

  public dispose(): void {
    this._watcher?.dispose();
  }

  private _getHtml(): string {
    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body {
            padding: 12px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
          }
          h2 {
            font-size: 14px;
            margin: 0 0 12px 0;
            font-weight: 600;
          }
          button {
            display: block;
            width: 100%;
            padding: 8px 12px;
            margin-bottom: 8px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-button-foreground);
            background-color: var(--vscode-button-background);
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .section {
            margin-bottom: 16px;
          }
          .description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
          }
          .repo-section {
            margin-bottom: 12px;
            padding: 8px;
            border-radius: 4px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
          }
          .repo-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
          }
          .repo-name {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 6px;
            word-break: break-all;
          }
          .repo-path {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
            word-break: break-all;
          }
          .select-repo-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            font-size: 12px;
            padding: 4px 8px;
          }
          .select-repo-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          .divider {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 12px 0;
          }

          /* ── Branch status card ── */
          .branch-card {
            margin-bottom: 12px;
            padding: 10px 12px;
            border-radius: 6px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
          }
          .branch-card-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
          }
          .branch-card-name {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
          }
          .branch-card-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
          }
          .badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
            margin-right: 4px;
          }
          .badge-changes {
            background: var(--vscode-editorWarning-foreground);
            color: var(--vscode-editor-background);
          }
          .badge-push {
            background: var(--vscode-editorInfo-foreground);
            color: var(--vscode-editor-background);
          }
          .badge-clean {
            color: var(--vscode-descriptionForeground);
          }

          /* ── Branch list ── */
          .branch-list {
            margin-bottom: 12px;
          }
          .branch-list-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
          }
          .branch-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 0;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
          }
          .branch-item.active {
            color: var(--vscode-foreground);
            font-weight: 600;
          }
          .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--vscode-descriptionForeground);
            flex-shrink: 0;
          }
          .branch-item.active .dot {
            background: var(--vscode-editorInfo-foreground);
          }
        </style>
      </head>
      <body>
        <h2>🌿 Git Simplifier</h2>

        <div class="repo-section">
          <div class="repo-label">Repository</div>
          <div class="repo-name" id="repoName">No repo selected</div>
          <div class="repo-path" id="repoPath"></div>
          <button class="select-repo-btn" onclick="send('selectRepo')">📂 Select Repository</button>
        </div>

        <!-- Current branch card -->
        <div class="branch-card" id="branchCard" style="display: none;">
          <div class="branch-card-label">Current Branch</div>
          <div class="branch-card-name" id="branchName">—</div>
          <div class="branch-card-meta" id="branchMeta"></div>
        </div>

        <hr class="divider" />

        <div class="section">
          <div class="description">Create a new branch via worktree</div>
          <button onclick="send('createBranch')">➕ Create Branch</button>
        </div>

        <div class="section">
          <div class="description">Sync a local branch with remote master</div>
          <button onclick="send('syncBranch')">🔄 Sync with Master</button>
        </div>

        <div class="section">
          <div class="description">Commit & push changes to remote</div>
          <button onclick="send('commitAndPush')">🚀 Commit & Push</button>
        </div>

        <div class="section">
          <div class="description">Remove a local branch and its worktree</div>
          <button onclick="send('removeBranch')">🗑️ Remove Branch</button>
        </div>

        <!-- Branch list -->
        <hr class="divider" />
        <div class="branch-list" id="branchListSection" style="display: none;">
          <div class="branch-list-label" id="branchListLabel">Local Branches</div>
          <div id="branchList"></div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function send(command) {
            vscode.postMessage({ command });
          }

          window.addEventListener('message', (event) => {
            const s = event.data;
            if (s.type !== 'state') return;

            // Repo info
            const nameEl = document.getElementById('repoName');
            const pathEl = document.getElementById('repoPath');
            if (s.repoName) {
              nameEl.textContent = '📦 ' + s.repoName;
              pathEl.textContent = s.repoPath;
            } else {
              nameEl.textContent = 'No repo selected';
              pathEl.textContent = '';
            }

            // Branch card
            const branchCard = document.getElementById('branchCard');
            const branchName = document.getElementById('branchName');
            const branchMeta = document.getElementById('branchMeta');

            if (s.currentBranch) {
              branchCard.style.display = '';
              branchName.textContent = s.currentBranch;

              let meta = '';
              if (s.changedFiles > 0) {
                meta += '<span class="badge badge-changes">' + s.changedFiles + ' changed</span>';
              }
              if (s.unpushedCount > 0) {
                meta += '<span class="badge badge-push">↑ ' + s.unpushedCount + ' to push</span>';
              }
              if (!meta) {
                meta = '<span class="badge-clean">✓ Clean & up to date</span>';
              }
              branchMeta.innerHTML = meta;
            } else {
              branchCard.style.display = 'none';
            }

            // Branch list
            const branchListSection = document.getElementById('branchListSection');
            const branchList = document.getElementById('branchList');
            const branchListLabel = document.getElementById('branchListLabel');

            if (s.branches && s.branches.length > 0) {
              branchListSection.style.display = '';
              branchListLabel.textContent = 'Local Branches (' + s.branches.length + ')';
              branchList.innerHTML = s.branches.map(b => {
                const isActive = b === s.currentBranch;
                return '<div class="branch-item ' + (isActive ? 'active' : '') + '">'
                  + '<span class="dot"></span>'
                  + '<span>' + b + '</span>'
                  + '</div>';
              }).join('');
            } else {
              branchListSection.style.display = 'none';
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
