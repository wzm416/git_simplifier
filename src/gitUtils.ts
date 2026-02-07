import * as cp from "child_process";

/**
 * Execute a git command in the given working directory.
 * Returns stdout on success, throws on failure.
 */
export function gitExec(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * List local branches.
 */
export async function getLocalBranches(repoRoot: string): Promise<string[]> {
  const output = await gitExec(["branch", "--format=%(refname:short)"], repoRoot);
  if (!output) {return [];}
  return output.split("\n").filter(Boolean);
}

/**
 * List remote branches.
 */
export async function getRemoteBranches(repoRoot: string): Promise<string[]> {
  await gitExec(["fetch", "--all"], repoRoot);
  const output = await gitExec(["branch", "-r", "--format=%(refname:short)"], repoRoot);
  if (!output) {return [];}
  return output
    .split("\n")
    .filter(Boolean)
    .filter((b) => !b.includes("HEAD"));
}

/**
 * List current worktrees and return their paths and branch names.
 */
export async function getWorktrees(repoRoot: string): Promise<{ path: string; branch: string }[]> {
  const output = await gitExec(["worktree", "list", "--porcelain"], repoRoot);
  const worktrees: { path: string; branch: string }[] = [];
  let currentPath = "";

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      currentPath = line.replace("worktree ", "");
    } else if (line.startsWith("branch ")) {
      const branch = line.replace("branch refs/heads/", "");
      worktrees.push({ path: currentPath, branch });
    }
  }
  return worktrees;
}

/**
 * Get the current branch name for a given worktree path.
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  return gitExec(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

/**
 * Detect the default remote branch (master or main).
 * Returns "origin/main" or "origin/master" depending on the repo.
 */
export async function getDefaultRemoteBranch(repoRoot: string): Promise<string> {
  try {
    const ref = await gitExec(["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], repoRoot);
    return ref; // e.g., "origin/main"
  } catch {
    // Fallback: check if origin/main or origin/master exists
    try {
      await gitExec(["rev-parse", "--verify", "origin/main"], repoRoot);
      return "origin/main";
    } catch {
      return "origin/master";
    }
  }
}
