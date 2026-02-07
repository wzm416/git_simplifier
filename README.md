# Git Simplifier

A VS Code extension that provides a simple UI to manage Git branches locally using **git worktree**, enabling parallel work across multiple branches simultaneously.

---

## Features

### 1. Create New Branch (via Git Worktree)

A "Create" button with a dropdown offering three options:

- **From `origin/master`** — Create a branch fully synced with remote master.
- **From an existing local branch** — Create a branch based on a selected local branch (dependent branch).
- **Clone a remote branch** — Clone a remote branch as-is (useful for reproducing bugs at a specific version).

After selection:

- A new VS Code window opens with the new branch checked out in its own worktree directory.

### 2. Sync Local Branch with Remote Master

- Dropdown to select which local branch to sync.
- **No conflicts** → auto-merge, commit, and show "Sync Success."
- **Conflicts** → open a new VS Code window on that branch for manual resolution; button changes to "Re-sync." After conflicts are resolved, user clicks "Re-sync" to commit.

### 3. Commit & Push

- Commit changes on the current branch.
- Push to remote.
- If it's the first push, automatically create the remote tracking branch.

### 4. Remove Local Branch

- Delete a local branch and its associated worktree cleanly.

---

## Implementation Plan

### Step 1: Scaffold the VS Code Extension

- Initialize the extension project (package.json, tsconfig, etc.).
- Register the extension's Sidebar/Webview panel.
- Create a basic Tree View or Webview with placeholder buttons.

### Step 2: Create New Branch (Worktree)

- Implement the three branch creation options using `git worktree add`.
- Add Quick Pick dropdowns for branch selection.
- Open a new VS Code window at the worktree path after creation.

### Step 3: Sync Branch with Remote Master

- List local worktree branches in a Quick Pick dropdown.
- Run `git fetch` + `git merge origin/master`.
- Detect conflicts: if none, auto-commit; if conflicts, open the worktree in a new window and provide a "Re-sync" button.

### Step 4: Commit & Push

- Stage all changes, commit with a user-provided message.
- Push to remote; if no upstream exists, run `git push -u origin <branch>`.

### Step 5: Remove Local Branch

- Remove the worktree (`git worktree remove`).
- Delete the branch (`git branch -D`).
- Refresh the UI.

---

## Tech Stack

- **Language**: TypeScript
- **Platform**: VS Code Extension API
- **Git**: Executed via `child_process` (spawning git commands)
- **UI**: VS Code TreeView + Quick Picks + Webview (for sidebar panel)
