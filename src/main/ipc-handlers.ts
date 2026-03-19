import { ipcMain, dialog, shell, app, type BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { IPC } from "../shared/types.js";
import type { AgentId, SSHConnection, ClaudeSession, CreateAgentOpts } from "../shared/types.js";
import { AgentManager } from "./agent-manager.js";
import { PtyManager } from "./pty-manager.js";
import { getGitInfo, getGitRemoteUrl, getGitFileStatuses } from "./git-service.js";
import { testConnection, listRemoteDir, loadRecentConnections, getRemoteGitInfo } from "./ssh-service.js";
import { loadSettings, saveSettings } from "./store.js";
import type { AppSettings } from "../shared/types.js";

/**
 * Decode a Claude project directory name back to a real filesystem path.
 * Claude encodes "/Users/will/repos/agent-orchestrator" as
 * "-Users-will-repos-agent-orchestrator". A naive replace of all `-` with `/`
 * breaks on directory names that contain dashes. This walks the filesystem
 * greedily to find which dashes are path separators.
 */
async function decodeClaudeProjectDir(encoded: string): Promise<string | null> {
  // Strip leading dash → split on remaining dashes
  const parts = encoded.replace(/^-/, "").split("-");

  async function resolve(idx: number, current: string): Promise<string | null> {
    if (idx >= parts.length) {
      // Reached the end — check if this path exists
      try {
        await fs.access(current);
        return current;
      } catch {
        return null;
      }
    }

    // Try greedily: join as many remaining parts as possible with dashes,
    // then fall back to fewer. This prefers longer directory names (e.g.
    // "agent-orchestrator" over "agent" + "orchestrator").
    for (let end = parts.length; end > idx; end--) {
      const segment = parts.slice(idx, end).join("-");
      const candidate = current + "/" + segment;
      try {
        await fs.access(candidate);
        const result = await resolve(end, candidate);
        if (result) return result;
      } catch {
        // candidate doesn't exist, try shorter
      }
    }
    return null;
  }

  return resolve(0, "");
}

export function registerIpcHandlers(
  agentManager: AgentManager,
  ptyManager: PtyManager,
  mainWindow: BrowserWindow
): void {
  // --- PTY handlers ---
  ipcMain.handle(IPC.PTY_SPAWN, (_event, agentId: string, cwd: string, ssh?: SSHConnection, resumeSessionId?: string) =>
    ptyManager.spawn(agentId, cwd, ssh, resumeSessionId)
  );

  ipcMain.handle(IPC.PTY_WRITE, (_event, agentId: string, data: string) =>
    ptyManager.write(agentId, data)
  );

  ipcMain.handle(IPC.PTY_RESIZE, (_event, agentId: string, cols: number, rows: number) =>
    ptyManager.resize(agentId, cols, rows)
  );

  ipcMain.handle(IPC.PTY_KILL, (_event, agentId: string) =>
    ptyManager.kill(agentId)
  );

  ipcMain.handle(IPC.AGENT_CREATE, (_event, opts: CreateAgentOpts) =>
    agentManager.createAgent(opts)
  );

  ipcMain.handle(IPC.AGENT_STOP, (_event, id: AgentId) =>
    agentManager.stopAgent(id)
  );

  ipcMain.handle(IPC.AGENT_REMOVE, (_event, id: AgentId) => {
    ptyManager.kill(id);
    agentManager.removeAgent(id);
  });

  ipcMain.handle(IPC.AGENT_LIST, () => agentManager.listAgents());

  ipcMain.handle(IPC.GIT_INFO, (_event, cwd: string) => getGitInfo(cwd));

  ipcMain.handle(IPC.DIALOG_OPEN_DIR, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Select a project directory",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC.FILE_READ, async (_event, filePath: string) => {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    IPC.FILE_WRITE,
    async (_event, filePath: string, content: string) => {
      await fs.writeFile(filePath, content, "utf-8");
    }
  );

  ipcMain.handle(IPC.LIST_DIR, async (_event, dirPath: string) => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith("."))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  });

  ipcMain.handle(IPC.GIT_REMOTE_URL, (_event, cwd: string) =>
    getGitRemoteUrl(cwd)
  );

  ipcMain.handle(IPC.GIT_FILE_STATUSES, (_event, cwd: string) =>
    getGitFileStatuses(cwd)
  );

  ipcMain.handle(IPC.OPEN_EXTERNAL, (_event, url: string) =>
    shell.openExternal(url)
  );

  ipcMain.handle(IPC.SSH_TEST, (_event, conn: SSHConnection) =>
    testConnection(conn)
  );

  ipcMain.handle(IPC.SSH_LIST_DIR, (_event, conn: SSHConnection, remotePath: string) =>
    listRemoteDir(conn, remotePath)
  );

  ipcMain.handle(IPC.SSH_RECENT, () => loadRecentConnections());

  ipcMain.handle(IPC.SSH_GIT_INFO, (_event, conn: SSHConnection, cwd: string) =>
    getRemoteGitInfo(conn, cwd)
  );

  ipcMain.handle(IPC.AGENT_UPDATE_SESSION, (_event, agentId: string, sessionId: string) =>
    agentManager.updateSessionId(agentId, sessionId)
  );

  ipcMain.handle(IPC.CLAUDE_LIST_SESSIONS, async (): Promise<ClaudeSession[]> => {
    const projectsDir = path.join(os.homedir(), ".claude", "projects");
    const sessions: ClaudeSession[] = [];

    try {
      const dirs = await fs.readdir(projectsDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        // Decode directory name back to a real path.
        // Claude encodes "/Users/will/repos/agent-orchestrator" as
        // "-Users-will-repos-agent-orchestrator". Simple replace breaks
        // on directory names that contain dashes. Walk the filesystem to
        // resolve which dashes are path separators.
        const cwd = await decodeClaudeProjectDir(dir.name);
        if (!cwd) continue; // directory no longer exists, skip

        const projectPath = path.join(projectsDir, dir.name);
        const files = await fs.readdir(projectPath);
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;
          const sessionId = file.replace(".jsonl", "");
          // Skip non-UUID filenames
          if (!/^[a-f0-9-]{36}$/.test(sessionId)) continue;

          const stat = await fs.stat(path.join(projectPath, file));
          sessions.push({
            sessionId,
            cwd,
            projectDir: dir.name,
            modifiedAt: stat.mtimeMs,
          });
        }
      }
    } catch {
      // ~/.claude/projects may not exist
    }

    // Sort by most recently modified
    sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return sessions.slice(0, 50);
  });

  ipcMain.handle(IPC.SETTINGS_GET, () => loadSettings());

  ipcMain.handle(IPC.SETTINGS_SET, (_event, settings: AppSettings) => {
    saveSettings(settings);
  });

  ipcMain.handle(IPC.AGENT_RENAME, (_event, agentId: string, name: string) =>
    agentManager.renameAgent(agentId, name)
  );

  ipcMain.handle(IPC.AGENT_RESET_NAME, (_event, agentId: string) =>
    agentManager.resetAgentName(agentId)
  );

  // Dock badge (macOS)
  ipcMain.on(IPC.DOCK_BADGE, (_event, text: string) => {
    if (process.platform === "darwin" && app.dock) {
      app.dock.setBadge(text);
    }
  });

}
