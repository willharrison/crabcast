import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitInfo } from "../shared/types.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 5000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getGitInfo(cwd: string): Promise<GitInfo> {
  const [branch, status, log] = await Promise.all([
    git(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    git(["status", "--short"], cwd),
    git(["log", "--oneline", "-10", "--format=%h %s"], cwd),
  ]);

  const recentLog = log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const spaceIdx = line.indexOf(" ");
      return {
        hash: line.slice(0, spaceIdx),
        subject: line.slice(spaceIdx + 1),
      };
    });

  return {
    branch: branch || "N/A",
    status,
    dirty: status.length > 0,
    recentLog,
  };
}

export async function getRepoBranch(cwd: string): Promise<string | undefined> {
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  return branch || undefined;
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await git(["rev-parse", "--is-inside-work-tree"], cwd);
  return result === "true";
}

/** Returns a map of relative file paths to their git status codes (M, A, D, ?, etc.) */
export async function getGitFileStatuses(cwd: string): Promise<Record<string, string>> {
  const raw = await git(["status", "--porcelain"], cwd);
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const xy = line.slice(0, 2);
    const filePath = line.slice(3);
    // Determine the most relevant status character
    const index = xy[0];
    const worktree = xy[1];
    let status = "M";
    if (index === "?" || worktree === "?") status = "?";
    else if (index === "A" || worktree === "A") status = "A";
    else if (index === "D" || worktree === "D") status = "D";
    else if (index === "R" || worktree === "R") status = "R";
    else if (index === "M" || worktree === "M") status = "M";
    result[filePath] = status;
  }
  return result;
}

/** Returns an HTTPS GitHub/GitLab URL like https://github.com/user/repo, or null. */
export async function getGitRemoteUrl(cwd: string): Promise<string | null> {
  const raw = await git(["remote", "get-url", "origin"], cwd);
  if (!raw) return null;
  // ssh: git@github.com:user/repo.git
  const sshMatch = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
  // https: https://github.com/user/repo.git
  const httpsMatch = raw.match(/^(https?:\/\/.+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];
  return null;
}
