import * as pty from "node-pty";
import type { BrowserWindow } from "electron";
import type { AgentId, SSHConnection } from "../shared/types.js";
import { IPC } from "../shared/types.js";

interface PtySession {
  pty: pty.IPty;
  agentId: AgentId;
}

export class PtyManager {
  private sessions = new Map<AgentId, PtySession>();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Spawn an interactive claude CLI session in a real PTY.
   * The renderer connects an xterm.js terminal to this PTY via IPC.
   */
  spawn(agentId: AgentId, cwd: string, ssh?: SSHConnection, resumeSessionId?: string): void {
    // Kill existing session if any
    this.kill(agentId);

    let shell: string;
    let args: string[];

    if (ssh) {
      shell = "ssh";
      args = [
        "-o", "ConnectTimeout=10",
        "-tt",
      ];
      if (ssh.port && ssh.port !== 22) {
        args.push("-p", String(ssh.port));
      }
      args.push(`${ssh.user}@${ssh.host}`);
      // Start claude in the remote directory.
      // Use a login shell so the user's PATH (from .bashrc/.zshrc/.profile) is loaded —
      // without this, tools installed via npm/pip won't be found.
      const escapedCwd = cwd.replace(/'/g, "'\\''");
      const resumeFlag = resumeSessionId ? ` --resume '${resumeSessionId}'` : "";
      args.push(`bash -l -c 'cd ${escapedCwd} && claude${resumeFlag}'`);
    } else {
      // Use an interactive login shell so the user's full PATH is loaded.
      // Packaged Electron apps get a minimal environment from macOS —
      // -l loads .zprofile, -i loads .zshrc/.bashrc where PATH is usually set.
      const resumeFlag = resumeSessionId ? ` --resume '${resumeSessionId}'` : "";
      const escapedCwd = cwd.replace(/'/g, "'\\''");
      shell = process.env.SHELL || "/bin/zsh";
      args = ["-l", "-i", "-c", `cd '${escapedCwd}' && claude${resumeFlag}`];
    }

    const ptyProcess = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: undefined,
      env: { ...process.env } as Record<string, string>,
    });

    const session: PtySession = { pty: ptyProcess, agentId };
    this.sessions.set(agentId, session);

    // Buffer to detect session ID from Claude output.
    // Keep a rolling tail so we catch the ID whether it appears at startup or exit.
    let outputBuffer = "";
    let sessionDetected = false;
    const SESSION_RE = /--resume\s+([a-f0-9-]{36})/;

    ptyProcess.onData((data) => {
      this.send(IPC.PTY_DATA, { agentId, data });

      if (!sessionDetected) {
        outputBuffer += data;
        // Keep only the last 4KB to bound memory
        if (outputBuffer.length > 4096) {
          outputBuffer = outputBuffer.slice(-2048);
        }
        const match = outputBuffer.match(SESSION_RE);
        if (match) {
          sessionDetected = true;
          outputBuffer = "";
          this.send(IPC.PTY_SESSION_ID, { agentId, sessionId: match[1] });
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      // Final check — Claude prints the resume hint on exit
      if (!sessionDetected && outputBuffer) {
        const match = outputBuffer.match(SESSION_RE);
        if (match) {
          this.send(IPC.PTY_SESSION_ID, { agentId, sessionId: match[1] });
        }
      }
      this.sessions.delete(agentId);
      this.send(IPC.PTY_EXIT, { agentId, exitCode });
    });
  }

  /** Write data from the renderer's xterm into the PTY stdin */
  write(agentId: AgentId, data: string): void {
    this.sessions.get(agentId)?.pty.write(data);
  }

  /** Resize the PTY to match the xterm dimensions */
  resize(agentId: AgentId, cols: number, rows: number): void {
    this.sessions.get(agentId)?.pty.resize(cols, rows);
  }

  /** Kill a PTY session */
  kill(agentId: AgentId): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(agentId);
    }
  }

  /** Check if a PTY session exists for an agent */
  has(agentId: AgentId): boolean {
    return this.sessions.has(agentId);
  }

  /** Kill all PTY sessions */
  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
  }

  private send(channel: string, data: unknown): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
