import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import type { SSHConnection, RemoteDirEntry, GitInfo } from "../shared/types.js";

const exec = promisify(execFile);

const RECENT_PATH = path.join(app.getPath("userData"), "ssh-recent.json");

function sshTarget(conn: SSHConnection): string {
  return `${conn.user}@${conn.host}`;
}

function sshArgs(conn: SSHConnection): string[] {
  const args = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=accept-new",
  ];
  if (conn.port && conn.port !== 22) {
    args.push("-p", String(conn.port));
  }
  args.push(sshTarget(conn));
  return args;
}

export async function testConnection(
  conn: SSHConnection
): Promise<{ ok: boolean; error?: string }> {
  try {
    await exec("ssh", [...sshArgs(conn), "echo ok"], { timeout: 10000 });
    saveRecentConnection(conn);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function listRemoteDir(
  conn: SSHConnection,
  remotePath: string
): Promise<RemoteDirEntry[]> {
  // Use ls -1F to get entries with type indicators (/ for dirs)
  const { stdout } = await exec(
    "ssh",
    [...sshArgs(conn), `ls -1aF ${escapeShellArg(remotePath)}`],
    { timeout: 10000 }
  );

  const entries: RemoteDirEntry[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "./" || trimmed === "../") continue;

    const isDirectory = trimmed.endsWith("/");
    const name = isDirectory ? trimmed.slice(0, -1) : trimmed.replace(/[@*|=]$/, "");

    // Skip hidden files except common ones
    if (name.startsWith(".") && name !== ".." && name !== ".") continue;

    entries.push({ name, isDirectory });
  }

  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export async function getRemoteGitInfo(
  conn: SSHConnection,
  cwd: string
): Promise<GitInfo | null> {
  try {
    const escapedCwd = escapeShellArg(cwd);
    const { stdout } = await exec(
      "ssh",
      [
        ...sshArgs(conn),
        `cd ${escapedCwd} && git rev-parse --is-inside-work-tree 2>/dev/null && echo "---BRANCH---" && git branch --show-current && echo "---STATUS---" && git status --porcelain && echo "---LOG---" && git log --oneline -5 2>/dev/null`,
      ],
      { timeout: 10000 }
    );

    if (!stdout.includes("true")) return null;

    const branchMatch = stdout.split("---BRANCH---\n")[1]?.split("\n---STATUS---")[0]?.trim();
    const statusSection = stdout.split("---STATUS---\n")[1]?.split("\n---LOG---")[0]?.trim();
    const logSection = stdout.split("---LOG---\n")[1]?.trim();

    const recentLog = (logSection ?? "")
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
      branch: branchMatch ?? "unknown",
      status: statusSection ?? "",
      dirty: (statusSection ?? "").length > 0,
      recentLog,
    };
  } catch {
    return null;
  }
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Recent connections persistence

export function loadRecentConnections(): SSHConnection[] {
  try {
    const raw = fs.readFileSync(RECENT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveRecentConnection(conn: SSHConnection): void {
  const recent = loadRecentConnections();
  // Remove duplicate
  const filtered = recent.filter(
    (c) => !(c.user === conn.user && c.host === conn.host && (c.port ?? 22) === (conn.port ?? 22))
  );
  // Prepend new
  filtered.unshift(conn);
  // Keep max 10
  const capped = filtered.slice(0, 10);
  try {
    fs.writeFileSync(RECENT_PATH, JSON.stringify(capped, null, 2));
  } catch {
    // silent
  }
}
