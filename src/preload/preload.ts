import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ElectronAPI } from "../shared/types.js";

const api: ElectronAPI = {
  createAgent: (opts) => ipcRenderer.invoke(IPC.AGENT_CREATE, opts),
  stopAgent: (id) => ipcRenderer.invoke(IPC.AGENT_STOP, id),
  removeAgent: (id) => ipcRenderer.invoke(IPC.AGENT_REMOVE, id),
  listAgents: () => ipcRenderer.invoke(IPC.AGENT_LIST),
  getGitInfo: (cwd) => ipcRenderer.invoke(IPC.GIT_INFO, cwd),
  openDirectoryDialog: () => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR),
  readFile: (filePath) => ipcRenderer.invoke(IPC.FILE_READ, filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke(IPC.FILE_WRITE, filePath, content),

  listDir: (dirPath) => ipcRenderer.invoke(IPC.LIST_DIR, dirPath),
  getGitRemoteUrl: (cwd) => ipcRenderer.invoke(IPC.GIT_REMOTE_URL, cwd),
  getGitFileStatuses: (cwd) => ipcRenderer.invoke(IPC.GIT_FILE_STATUSES, cwd),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),

  ptySpawn: (agentId, cwd, ssh, resumeSessionId) => ipcRenderer.invoke(IPC.PTY_SPAWN, agentId, cwd, ssh, resumeSessionId),
  ptyWrite: (agentId, data) => ipcRenderer.invoke(IPC.PTY_WRITE, agentId, data),
  ptyResize: (agentId, cols, rows) => ipcRenderer.invoke(IPC.PTY_RESIZE, agentId, cols, rows),
  ptyKill: (agentId) => ipcRenderer.invoke(IPC.PTY_KILL, agentId),
  onPtyData: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on(IPC.PTY_DATA, listener);
    return () => ipcRenderer.removeListener(IPC.PTY_DATA, listener);
  },
  onPtyExit: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on(IPC.PTY_EXIT, listener);
    return () => ipcRenderer.removeListener(IPC.PTY_EXIT, listener);
  },
  onPtySessionId: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on(IPC.PTY_SESSION_ID, listener);
    return () => ipcRenderer.removeListener(IPC.PTY_SESSION_ID, listener);
  },
  updateAgentSession: (agentId, sessionId) => ipcRenderer.invoke(IPC.AGENT_UPDATE_SESSION, agentId, sessionId),

  listClaudeSessions: () => ipcRenderer.invoke(IPC.CLAUDE_LIST_SESSIONS),

  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (settings) => ipcRenderer.invoke(IPC.SETTINGS_SET, settings),

  renameAgent: (id, name) => ipcRenderer.invoke(IPC.AGENT_RENAME, id, name),
  resetAgentName: (id) => ipcRenderer.invoke(IPC.AGENT_RESET_NAME, id),

  sshTest: (conn) => ipcRenderer.invoke(IPC.SSH_TEST, conn),
  sshListDir: (conn, remotePath) => ipcRenderer.invoke(IPC.SSH_LIST_DIR, conn, remotePath),
  sshGetRecentConnections: () => ipcRenderer.invoke(IPC.SSH_RECENT),
  sshGetGitInfo: (conn, cwd) => ipcRenderer.invoke(IPC.SSH_GIT_INFO, conn, cwd),

  onAgentStateChanged: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on(IPC.AGENT_STATE_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.AGENT_STATE_CHANGED, listener);
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
