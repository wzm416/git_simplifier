import * as vscode from "vscode";
import * as path from "path";
import { RepoManager } from "./repoManager";
import { gitExec, getCurrentBranch, getLocalBranches } from "./gitUtils";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gitSimplifierView";

  private _view?: vscode.WebviewView;
  private _gitHeadWatcher?: vscode.FileSystemWatcher;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _repoManager: RepoManager
  ) {
    this._repoManager.onDidChangeRepo(() => {
      this._watchGitHead();
      this._refreshView();
    });
    this._repoManager.onDidGitChange(() => {
      this._refreshView();
    });

    // Start watching if repo already selected
    this._watchGitHead();
  }

  /**
   * Watch .git/HEAD so the sidebar auto-updates when branches change
   * externally (e.g. via terminal: git checkout -b, git checkout, etc.)
   */
  private _watchGitHead(): void {
    this._gitHeadWatcher?.dispose();
    const repo = this._repoManager.selectedRepo;
    if (!repo) { return; }

    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(repo, ".git")), "HEAD"
    );
    this._gitHeadWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    this._gitHeadWatcher.onDidChange(() => this._refreshView());
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
        case "switchBranch":
          vscode.commands.executeCommand("gitSimplifier.switchBranch");
          break;
        case "syncBranch":
          vscode.commands.executeCommand("gitSimplifier.syncBranch");
          break;
        case "commit":
          vscode.commands.executeCommand("gitSimplifier.commit");
          break;
        case "push":
          vscode.commands.executeCommand("gitSimplifier.push");
          break;
        case "removeBranch":
          vscode.commands.executeCommand("gitSimplifier.removeBranch");
          break;
        case "refresh":
          this._refreshView();
          break;
      }
    });

    // Refresh when the view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._refreshView();
      }
    });
  }

  /** Gather repo info and push it to the webview. */
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
      });
      return;
    }

    try {
      const repoName = path.basename(repo);
      const branch = await getCurrentBranch(repo);
      const branches = await getLocalBranches(repo);

      // Get changed files list
      let changedFiles: { status: string; file: string }[] = [];
      try {
        const status = await gitExec(["status", "--porcelain"], repo);
        if (status) {
          changedFiles = status.split("\n").filter(Boolean).map((line) => ({
            status: line.substring(0, 2).trim(),
            file: line.substring(3),
          }));
        }
      } catch { /* ignore */ }

      // Get unpushed commit count
      let unpushedCount = 0;
      try {
        const log = await gitExec(["log", `origin/${branch}..HEAD`, "--oneline"], repo);
        unpushedCount = log ? log.split("\n").filter(Boolean).length : 0;
      } catch {
        // No upstream — count all commits
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

  private _getHtml(): string {
    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            padding: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: transparent;
          }

          /* ── Section headers ── */
          .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 16px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            user-select: none;
          }

          .section-header .count {
            font-weight: 400;
            opacity: 0.7;
          }

          /* ── Cards ── */
          .card {
            margin: 8px 12px;
            padding: 10px 12px;
            border-radius: 6px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
          }

          .card:hover {
            border-color: var(--vscode-focusBorder);
          }

          /* ── Current branch card ── */
          .branch-card {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
          }

          .branch-icon {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            background: var(--vscode-button-background);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            flex-shrink: 0;
          }

          .branch-info {
            flex: 1;
            min-width: 0;
          }

          .branch-name {
            font-size: 13px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .branch-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
          }

          .badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
            margin-left: 4px;
          }

          .badge-changes {
            background: var(--vscode-editorWarning-foreground);
            color: var(--vscode-editor-background);
          }

          .badge-push {
            background: var(--vscode-editorInfo-foreground);
            color: var(--vscode-editor-background);
          }

          /* ── Action rows ── */
          .action-list {
            padding: 4px 0;
          }

          .action-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 16px;
            cursor: pointer;
            font-size: 13px;
            color: var(--vscode-foreground);
            border: none;
            background: transparent;
            width: 100%;
            text-align: left;
            font-family: var(--vscode-font-family);
            border-radius: 0;
          }

          .action-row:hover {
            background: var(--vscode-list-hoverBackground);
          }

          .action-icon {
            width: 20px;
            text-align: center;
            font-size: 14px;
            flex-shrink: 0;
          }

          .action-label {
            flex: 1;
          }

          .action-desc {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
          }

          /* ── Repo selector ── */
          .repo-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 12px;
          }

          .repo-row:hover {
            background: var(--vscode-list-hoverBackground);
          }

          .repo-row .icon {
            opacity: 0.7;
          }

          .repo-row .name {
            font-weight: 600;
          }

          .repo-row .change-link {
            margin-left: auto;
            color: var(--vscode-textLink-foreground);
            font-size: 11px;
          }

          .repo-row .change-link:hover {
            text-decoration: underline;
          }

          /* ── Empty state ── */
          .empty-state {
            text-align: center;
            padding: 24px 16px;
            color: var(--vscode-descriptionForeground);
          }

          .empty-state .icon {
            font-size: 32px;
            margin-bottom: 8px;
          }

          .empty-state .title {
            font-size: 13px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
          }

          .empty-state .subtitle {
            font-size: 12px;
            margin-bottom: 12px;
          }

          .primary-btn {
            display: inline-block;
            padding: 6px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
          }

          .primary-btn:hover {
            background: var(--vscode-button-hoverBackground);
          }

          /* ── Branch list ── */
          .branch-list-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 16px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
          }

          .branch-list-item .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--vscode-descriptionForeground);
            flex-shrink: 0;
          }

          .branch-list-item.active .dot {
            background: var(--vscode-editorInfo-foreground);
          }

          .branch-list-item.active {
            color: var(--vscode-foreground);
            font-weight: 500;
          }

          .hidden { display: none; }

          /* ── Changed files list ── */
          .changed-files {
            margin: 0 12px 8px;
            padding: 6px 10px;
            border-radius: 0 0 6px 6px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-top: none;
            font-size: 12px;
          }
          .changed-file {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 2px 0;
            color: var(--vscode-foreground);
          }
          .changed-file .file-status {
            font-size: 10px;
            font-weight: 600;
            width: 16px;
            text-align: center;
            flex-shrink: 0;
          }
          .changed-file .file-status.modified { color: var(--vscode-editorWarning-foreground); }
          .changed-file .file-status.added { color: var(--vscode-charts-green); }
          .changed-file .file-status.deleted { color: var(--vscode-editorError-foreground); }
          .changed-file .file-status.untracked { color: var(--vscode-charts-green); }
          .changed-file .file-name {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>

        <!-- ====== NO REPO STATE ====== -->
        <div id="noRepo">
          <div class="empty-state">
            <div class="icon">📂</div>
            <div class="title">Git Simplifier</div>
            <div class="subtitle">Select a repository to get started</div>
            <button class="primary-btn" onclick="send('selectRepo')">Select Repository</button>
          </div>
        </div>

        <!-- ====== MAIN VIEW ====== -->
        <div id="mainView" class="hidden">

          <!-- Repo bar -->
          <div class="repo-row" onclick="send('selectRepo')">
            <span class="icon">📦</span>
            <span class="name" id="repoName">—</span>
            <span class="change-link">Change</span>
          </div>

          <!-- Current branch -->
          <div class="section-header">Current work item</div>
          <div class="card branch-card" onclick="send('switchBranch')">
            <div class="branch-icon">🌿</div>
            <div class="branch-info">
              <div class="branch-name" id="branchName">—</div>
              <div class="branch-meta" id="branchMeta"></div>
            </div>
          </div>
          <div id="changedFilesList" class="changed-files" style="display:none;"></div>

          <!-- Branch actions -->
          <div class="section-header">Branches</div>
          <div class="action-list">
            <button class="action-row" onclick="send('createBranch')">
              <span class="action-icon">＋</span>
              <span class="action-label">Create Branch</span>
              <span class="action-desc">worktree</span>
            </button>
            <button class="action-row" onclick="send('switchBranch')">
              <span class="action-icon">⇄</span>
              <span class="action-label">Switch Branch</span>
            </button>
            <button class="action-row" onclick="send('syncBranch')">
              <span class="action-icon">↻</span>
              <span class="action-label">Sync with Master</span>
              <span class="action-desc">merge</span>
            </button>
            <button class="action-row" onclick="send('removeBranch')">
              <span class="action-icon">✕</span>
              <span class="action-label">Remove Branch</span>
            </button>
          </div>

          <!-- Source control actions -->
          <div class="section-header">
            Source Control
            <span class="count" id="scCount"></span>
          </div>
          <div class="action-list">
            <button class="action-row" onclick="send('commit')">
              <span class="action-icon">✓</span>
              <span class="action-label">Commit</span>
              <span class="action-desc" id="changesDesc"></span>
            </button>
            <button class="action-row" onclick="send('push')">
              <span class="action-icon">↑</span>
              <span class="action-label">Push</span>
              <span class="action-desc" id="pushDesc"></span>
            </button>
          </div>

          <!-- Local branches -->
          <div class="section-header">
            Local Branches
            <span class="count" id="branchCount"></span>
          </div>
          <div id="branchList" class="action-list" style="padding: 4px 0 8px;"></div>

        </div>

        <script>
          const vscode = acquireVsCodeApi();
          function send(command) { vscode.postMessage({ command }); }

          window.addEventListener('message', (event) => {
            const s = event.data;
            if (s.type !== 'state') return;

            const noRepo = document.getElementById('noRepo');
            const mainView = document.getElementById('mainView');

            if (!s.repoName) {
              noRepo.classList.remove('hidden');
              mainView.classList.add('hidden');
              return;
            }

            noRepo.classList.add('hidden');
            mainView.classList.remove('hidden');

            // Repo name
            document.getElementById('repoName').textContent = s.repoName;

            // Current branch
            const branchName = document.getElementById('branchName');
            const branchMeta = document.getElementById('branchMeta');
            branchName.textContent = s.currentBranch || '(detached)';

            let meta = '';
            const files = s.changedFiles || [];
            if (files.length > 0) {
              meta += '<span class="badge badge-changes">' + files.length + ' changed</span>';
            }
            if (s.unpushedCount > 0) {
              meta += '<span class="badge badge-push">↑ ' + s.unpushedCount + '</span>';
            }
            if (!meta) { meta = 'Clean'; }
            branchMeta.innerHTML = meta;

            // Changed files list
            const changedFilesList = document.getElementById('changedFilesList');
            if (files.length > 0) {
              changedFilesList.style.display = '';
              changedFilesList.innerHTML = files.map(f => {
                const st = f.status;
                let cls = '';
                let label = st;
                if (st === 'M' || st === 'MM') { cls = 'modified'; label = 'M'; }
                else if (st === 'A' || st === 'AM') { cls = 'added'; label = 'A'; }
                else if (st === 'D') { cls = 'deleted'; label = 'D'; }
                else if (st === '??' || st === 'U') { cls = 'untracked'; label = '?'; }
                return '<div class="changed-file">'
                  + '<span class="file-status ' + cls + '">' + label + '</span>'
                  + '<span class="file-name">' + f.file + '</span>'
                  + '</div>';
              }).join('');
            } else {
              changedFilesList.style.display = 'none';
              changedFilesList.innerHTML = '';
            }

            // Source control counts
            const scCount = document.getElementById('scCount');
            const changesDesc = document.getElementById('changesDesc');
            const pushDesc = document.getElementById('pushDesc');

            scCount.textContent = files.length > 0 ? files.length : '';
            changesDesc.textContent = files.length > 0 ? files.length + ' file(s)' : 'clean';
            pushDesc.textContent = s.unpushedCount > 0 ? s.unpushedCount + ' commit(s)' : 'up to date';

            // Branch list
            const branchList = document.getElementById('branchList');
            const branchCountEl = document.getElementById('branchCount');
            branchCountEl.textContent = s.branches ? s.branches.length : '0';

            if (s.branches && s.branches.length > 0) {
              branchList.innerHTML = s.branches.map(b => {
                const isActive = b === s.currentBranch;
                return '<div class="branch-list-item ' + (isActive ? 'active' : '') + '">'
                  + '<span class="dot"></span>'
                  + '<span>' + b + '</span>'
                  + '</div>';
              }).join('');
            } else {
              branchList.innerHTML = '<div class="branch-list-item">No branches</div>';
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
