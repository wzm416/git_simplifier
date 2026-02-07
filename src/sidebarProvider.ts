import * as vscode from "vscode";
import * as path from "path";
import { RepoManager } from "./repoManager";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gitSimplifierView";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _repoManager: RepoManager
  ) {
    // Update sidebar when repo selection changes
    this._repoManager.onDidChangeRepo(() => {
      this._updateRepoDisplay();
    });
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

    // Send initial repo state
    this._updateRepoDisplay();

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
      }
    });
  }

  /** Send the current repo name to the webview for display. */
  private _updateRepoDisplay(): void {
    if (!this._view) {
      return;
    }
    const repo = this._repoManager.selectedRepo;
    const repoName = repo ? path.basename(repo) : null;
    this._view.webview.postMessage({
      type: "repoChanged",
      repoName,
      repoPath: repo,
    });
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
            margin-bottom: 16px;
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

        <hr class="divider" />

        <div class="section">
          <div class="description">Create a new branch via worktree</div>
          <button onclick="send('createBranch')">➕ Create Branch</button>
        </div>

        <div class="section">
          <div class="description">Switch to a different branch</div>
          <button onclick="send('switchBranch')">🔀 Switch Branch</button>
        </div>

        <div class="section">
          <div class="description">Sync a local branch with remote master</div>
          <button onclick="send('syncBranch')">🔄 Sync with Master</button>
        </div>

        <hr class="divider" />

        <div class="section">
          <div class="description">Stage and commit changes</div>
          <button onclick="send('commit')">💾 Commit</button>
        </div>

        <div class="section">
          <div class="description">Review and push commits to remote</div>
          <button onclick="send('push')">🚀 Push</button>
        </div>

        <hr class="divider" />

        <div class="section">
          <div class="description">Remove a local branch and its worktree</div>
          <button onclick="send('removeBranch')">🗑️ Remove Branch</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function send(command) {
            vscode.postMessage({ command });
          }

          // Listen for repo changes from the extension
          window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'repoChanged') {
              const nameEl = document.getElementById('repoName');
              const pathEl = document.getElementById('repoPath');
              if (message.repoName) {
                nameEl.textContent = '📦 ' + message.repoName;
                pathEl.textContent = message.repoPath;
              } else {
                nameEl.textContent = 'No repo selected';
                pathEl.textContent = '';
              }
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
