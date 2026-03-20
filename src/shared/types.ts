export type AgentId = string;

export type AgentState = "idle" | "running" | "stopped" | "error";

export type AgentType = "claude" | "codex";

export interface SSHConnection {
  user: string;
  host: string;
  port?: number;
}

export interface AgentInfo {
  id: AgentId;
  cwd: string;
  repoName: string;
  customName?: string;
  state: AgentState;
  sessionId?: string;
  createdAt: number;
  gitBranch?: string;
  gitDirty?: boolean;
  ssh?: SSHConnection;
  needsAttention?: boolean;
  agentType?: AgentType;
}

export interface CreateAgentOpts {
  cwd: string;
  ssh?: SSHConnection;
  agentType?: AgentType;
}

export interface GitInfo {
  branch: string;
  status: string;
  dirty: boolean;
  recentLog: Array<{ hash: string; subject: string }>;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface RemoteDirEntry {
  name: string;
  isDirectory: boolean;
}

export interface ClaudeSession {
  sessionId: string;
  cwd: string;
  projectDir: string;
  modifiedAt: number;
}

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppSettings {
  terminalFontSize: number;
  notifications: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  terminalFontSize: 13,
  notifications: true,
};

// IPC channel names
export const IPC = {
  AGENT_CREATE: "agent:create",
  AGENT_STOP: "agent:stop",
  AGENT_LIST: "agent:list",
  AGENT_REMOVE: "agent:remove",
  AGENT_STATE_CHANGED: "agent:state-changed",
  GIT_INFO: "git:info",
  DIALOG_OPEN_DIR: "dialog:open-dir",
  FILE_READ: "file:read",
  FILE_WRITE: "file:write",
  SSH_TEST: "ssh:test",
  SSH_LIST_DIR: "ssh:list-dir",
  SSH_RECENT: "ssh:recent",
  SSH_GIT_INFO: "ssh:git-info",
  LIST_DIR: "fs:list-dir",
  GIT_REMOTE_URL: "git:remote-url",
  GIT_FILE_STATUSES: "git:file-statuses",
  OPEN_EXTERNAL: "shell:open-external",
  PTY_SPAWN: "pty:spawn",
  PTY_WRITE: "pty:write",
  PTY_RESIZE: "pty:resize",
  PTY_KILL: "pty:kill",
  PTY_DATA: "pty:data",
  PTY_EXIT: "pty:exit",
  PTY_SESSION_ID: "pty:session-id",
  AGENT_UPDATE_SESSION: "agent:update-session",
  CLAUDE_LIST_SESSIONS: "claude:list-sessions",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  AGENT_RENAME: "agent:rename",
  AGENT_RESET_NAME: "agent:reset-name",
  DOCK_BADGE: "dock:badge",
  HOME_PATH: "app:home-path",
} as const;

// The API exposed to the renderer via contextBridge
export interface ElectronAPI {
  createAgent: (opts: CreateAgentOpts) => Promise<AgentInfo>;
  stopAgent: (id: AgentId) => Promise<void>;
  removeAgent: (id: AgentId) => Promise<void>;
  listAgents: () => Promise<AgentInfo[]>;
  getGitInfo: (cwd: string) => Promise<GitInfo>;
  openDirectoryDialog: () => Promise<string | null>;
  readFile: (filePath: string) => Promise<string | null>;
  writeFile: (filePath: string, content: string) => Promise<void>;

  listDir: (dirPath: string) => Promise<DirEntry[]>;
  getGitRemoteUrl: (cwd: string) => Promise<string | null>;
  getGitFileStatuses: (cwd: string) => Promise<Record<string, string>>;
  openExternal: (url: string) => Promise<void>;

  sshTest: (conn: SSHConnection) => Promise<{ ok: boolean; error?: string }>;
  sshListDir: (conn: SSHConnection, remotePath: string) => Promise<RemoteDirEntry[]>;
  sshGetRecentConnections: () => Promise<SSHConnection[]>;
  sshGetGitInfo: (conn: SSHConnection, cwd: string) => Promise<GitInfo | null>;

  ptySpawn: (agentId: AgentId, cwd: string, ssh?: SSHConnection, resumeSessionId?: string, agentType?: AgentType) => Promise<void>;
  ptyWrite: (agentId: AgentId, data: string) => Promise<void>;
  ptyResize: (agentId: AgentId, cols: number, rows: number) => Promise<void>;
  ptyKill: (agentId: AgentId) => Promise<void>;
  onPtyData: (cb: (data: { agentId: AgentId; data: string }) => void) => () => void;
  onPtyExit: (cb: (data: { agentId: AgentId; exitCode: number }) => void) => () => void;
  onPtySessionId: (cb: (data: { agentId: AgentId; sessionId: string }) => void) => () => void;
  updateAgentSession: (agentId: AgentId, sessionId: string) => Promise<void>;

  listClaudeSessions: () => Promise<ClaudeSession[]>;

  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: AppSettings) => Promise<void>;

  renameAgent: (id: AgentId, name: string) => Promise<AgentInfo>;
  resetAgentName: (id: AgentId) => Promise<AgentInfo>;
  setDockBadge: (text: string) => void;
  getHomePath: () => Promise<string>;

  onAgentStateChanged: (cb: (info: AgentInfo) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
