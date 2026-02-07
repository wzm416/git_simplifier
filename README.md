# Git Simplifier

A VS Code / Cursor extension that provides a simple, elegant UI to manage Git branches locally using **git worktree**, enabling parallel work across multiple branches simultaneously.

---

## Features

### 📂 Repository Selector

- Auto-scans your workspace for git repositories
- Pick which repo to work with from a dropdown
- Persists your selection across sessions

### ➕ Create New Branch (via Git Worktree)

Three branch creation modes:

- **From `origin/master`** — Create a branch fully synced with remote master (auto-detects `main` vs `master`)
- **From an existing local branch** — Branch off a selected local branch
- **Clone a remote branch** — Clone a remote branch as-is (great for reproducing bugs at a specific version)

Each new branch gets its own **worktree directory** and opens in a **new Cursor/VS Code window** for parallel development.

### 🔀 Switch Branch

- See all local branches with worktree status
- Worktree branches open in a new window
- Non-worktree branches checkout in place (auto-stashes uncommitted changes)

### 🔄 Sync with Remote Master

- Pick any local branch to sync
- Auto-fetches + merges `origin/master` (or `origin/main`)
- **No conflicts** → auto-commits, shows success
- **Conflicts** → opens worktree in new window for manual resolution, then use **Re-sync** to finalize

### 💾 Commit

- View changed files summary
- Stage all, pick individual files, or commit already-staged files
- Enter commit message
- After commit, optionally push right away or defer to later

### 🚀 Push

- Preview all unpushed commits before pushing
- Confirm before push
- Auto-creates remote tracking branch on first push (`git push -u origin <branch>`)

### 🗑️ Remove Branch

- Multi-select branches to delete
- Automatically removes associated worktrees
- Option to also delete the remote tracking branch
- Prevents deleting the currently checked-out branch

---

## Sidebar UI

The sidebar features a GitLens-inspired design:

- **Current work item** — shows active branch with change/push badges
- **Branches section** — create, switch, sync, remove branches
- **Source Control section** — commit and push with live status counts
- **Local Branches list** — at-a-glance view of all branches

---

## Tech Stack

- **Language**: TypeScript
- **Platform**: VS Code / Cursor Extension API
- **Git**: Executed via `child_process` (spawning git commands)
- **UI**: VS Code Webview sidebar with custom HTML/CSS

---

## Development

### Prerequisites

- Node.js ≥ 18
- npm

### Setup

```bash
cd git_simplifier
npm install
npm run compile
```

### Test locally

1. Open the `git_simplifier` folder in Cursor / VS Code
2. Press `F5` to launch the Extension Development Host
3. Or package and install manually:

```bash
npx @vscode/vsce package --no-dependencies --allow-star-activation --allow-missing-repository
```

Then install: `Cmd+Shift+P` → "Extensions: Install from VSIX"

---

## Publishing

### 1. Create a Publisher Account

- Go to [Azure DevOps](https://dev.azure.com) and sign in
- Visit the [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
- Create a publisher (e.g., `wzm416`)

### 2. Generate a Personal Access Token (PAT)

- In Azure DevOps → User Settings → Personal Access Tokens
- Create a new token with **Marketplace (Manage)** scope
- Save the token securely

### 3. Login with vsce

```bash
npx @vscode/vsce login wzm416
# Paste your Azure DevOps PAT when prompted
```

### 4. Publish

```bash
npx @vscode/vsce publish
```

### 5. Update Version (for future releases)

```bash
npx @vscode/vsce publish minor   # 0.0.1 → 0.1.0
npx @vscode/vsce publish patch   # 0.0.1 → 0.0.2
```

The extension will be live at:
**<https://marketplace.visualstudio.com/items?itemName=wzm416.git-simplifier>**

---

## License

MIT
