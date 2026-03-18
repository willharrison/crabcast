import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrowserWindow } from "electron";
import type {
  AgentId,
  AgentInfo,
  CreateAgentOpts,
} from "../shared/types.js";
import { IPC } from "../shared/types.js";
import { getRepoBranch, isGitRepo } from "./git-service.js";
import { getRemoteGitInfo } from "./ssh-service.js";
import { loadState, saveState } from "./store.js";

interface StoredAgent {
  info: AgentInfo;
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
      this.agents.set(info.id, { info });
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

    this.agents.set(id, { info });
    this.persist();

    return info;
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
