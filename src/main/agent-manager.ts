import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import type { BrowserWindow } from "electron";
import type {
  AgentId,
  AgentInfo,
  CreateAgentOpts,
} from "../shared/types.js";
import { IPC } from "../shared/types.js";
import { getRepoBranch, isGitRepo, getGitFileStatuses } from "./git-service.js";
import { getRemoteGitInfo } from "./ssh-service.js";
import { loadState, saveState } from "./store.js";

interface StoredAgent {
  info: AgentInfo;
  watchers?: fs.FSWatcher[];
}

export class AgentManager {
  private agents = new Map<AgentId, StoredAgent>();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.loadPersistedAgents();
  }

  private loadPersistedAgents(): void {
    const saved = loadState();
    for (const info of saved) {
      const stored: StoredAgent = { info };
      this.agents.set(info.id, stored);
      // Start git watchers for local repos
      if (!info.ssh) {
        this.watchGit(info.id, info.cwd, stored);
      }
    }
  }

  private persist(): void {
    saveState([...this.agents.values()].map((a) => a.info));
  }

  async createAgent(opts: CreateAgentOpts): Promise<AgentInfo> {
    const id = randomUUID();
    const repoName = path.basename(opts.cwd);

    const info: AgentInfo = {
      id,
      cwd: opts.cwd,
      repoName,
      state: "idle",
      createdAt: Date.now(),
      ssh: opts.ssh,
    };

    // Pre-fill git info
    if (opts.ssh) {
      const gitInfo = await getRemoteGitInfo(opts.ssh, opts.cwd);
      if (gitInfo) {
        info.gitBranch = gitInfo.branch;
        info.gitDirty = gitInfo.dirty;
      }
    } else if (await isGitRepo(opts.cwd)) {
      info.gitBranch = await getRepoBranch(opts.cwd);
    }

    const stored: StoredAgent = { info };
    this.agents.set(id, stored);
    this.persist();

    // Start watching git state for local (non-SSH) repos
    if (!opts.ssh) {
      this.watchGit(id, opts.cwd, stored);
    }

    return info;
  }

  private watchGit(id: AgentId, cwd: string, stored: StoredAgent): void {
    const gitDir = path.join(cwd, ".git");
    const watchers: fs.FSWatcher[] = [];

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const [branch, statuses] = await Promise.all([
            getRepoBranch(cwd),
            getGitFileStatuses(cwd),
          ]);
          const dirty = Object.keys(statuses).length > 0;
          const changed =
            stored.info.gitBranch !== branch || stored.info.gitDirty !== dirty;
          if (changed) {
            stored.info.gitBranch = branch;
            stored.info.gitDirty = dirty;
            this.persist();
            this.send(IPC.AGENT_STATE_CHANGED, stored.info);
          }
        } catch { /* git dir may not exist yet */ }
      }, 300);
    };

    try {
      // Watch HEAD for branch changes
      const headWatcher = fs.watch(path.join(gitDir, "HEAD"), refresh);
      watchers.push(headWatcher);
    } catch { /* not a git repo */ }

    try {
      // Watch index for staging changes
      const indexWatcher = fs.watch(path.join(gitDir, "index"), refresh);
      watchers.push(indexWatcher);
    } catch { /* no index yet */ }

    try {
      // Watch refs/heads for new commits
      const refsDir = path.join(gitDir, "refs", "heads");
      const refsWatcher = fs.watch(refsDir, { recursive: true }, refresh);
      watchers.push(refsWatcher);
    } catch { /* no refs yet */ }

    stored.watchers = watchers;
  }

  stopAgent(id: AgentId): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.info.state = "stopped";
      this.persist();
      this.send(IPC.AGENT_STATE_CHANGED, agent.info);
    }
  }

  removeAgent(id: AgentId): void {
    const agent = this.agents.get(id);
    if (agent?.watchers) {
      for (const w of agent.watchers) w.close();
    }
    this.agents.delete(id);
    this.persist();
  }

  listAgents(): AgentInfo[] {
    return [...this.agents.values()].map((a) => a.info);
  }

  getAgent(id: AgentId): AgentInfo | undefined {
    return this.agents.get(id)?.info;
  }

  updateSessionId(id: AgentId, sessionId: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.info.sessionId = sessionId;
      this.persist();
    }
  }

  renameAgent(id: AgentId, name: string): AgentInfo | undefined {
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    agent.info.customName = name;
    this.persist();
    this.send(IPC.AGENT_STATE_CHANGED, agent.info);
    return agent.info;
  }

  resetAgentName(id: AgentId): AgentInfo | undefined {
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    delete agent.info.customName;
    this.persist();
    this.send(IPC.AGENT_STATE_CHANGED, agent.info);
    return agent.info;
  }

  private send(channel: string, data: unknown): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
