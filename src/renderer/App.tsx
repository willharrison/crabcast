import { useState, useEffect, useRef, useCallback } from "react";
import { useAgents } from "./hooks/useAgents.js";
import { useSettings } from "./hooks/useSettings.js";
import { AgentList } from "./components/AgentList.js";
import { AgentDetail } from "./components/AgentDetail.js";
import { destroyTerminal } from "./components/Terminal.js";
import { SSHConnectModal } from "./components/SSHConnectModal.js";
import { ResumeSessionModal } from "./components/ResumeSessionModal.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { ShortcutsModal } from "./components/ShortcutsModal.js";
import type { AgentType, SSHConnection, ClaudeSession } from "../shared/types.js";

const BUILD_CHANNEL = (import.meta.env.VITE_BUILD_CHANNEL as string) || "local";

export function App() {
  const { agents, createAgent, stopAgent, removeAgent, patchAgent, reorderAgents } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSSHModal, setShowSSHModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [pendingAgentType, setPendingAgentType] = useState<AgentType>("claude");
  const [unreadAgents, setUnreadAgents] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("sidebarWidth");
    return saved ? parseInt(saved, 10) : 280;
  });
  const sidebarDragging = useRef(false);
  const { settings, updateSettings } = useSettings();

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  const selectAgent = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setUnreadAgents(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  // Persist sidebar width
  useEffect(() => {
    localStorage.setItem("sidebarWidth", String(sidebarWidth));
  }, [sidebarWidth]);

  const handleSidebarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!sidebarDragging.current) return;
      setSidebarWidth(Math.max(180, Math.min(500, ev.clientX)));
    };
    const onUp = () => {
      sidebarDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // System notifications + dock badge when agents need attention
  useEffect(() => {
    const attentionSet = new Set<string>();

    const updateBadge = () => {
      window.electronAPI.setDockBadge(attentionSet.size > 0 ? "!" : "");
    };

    const unsub = window.electronAPI.onAgentStateChanged((info) => {
      // Track which agents need attention for dock badge
      if (info.needsAttention) {
        attentionSet.add(info.id);
      } else {
        attentionSet.delete(info.id);
      }
      updateBadge();

      if (!settings.notifications) return;

      if (!document.hasFocus() && info.needsAttention) {
        new Notification("Agent needs attention", {
          body: `${info.customName ?? info.repoName} is waiting for input`,
        });
      }
      if (!document.hasFocus() && info.state === "idle" && !info.needsAttention) {
        new Notification("Agent finished", {
          body: `${info.customName ?? info.repoName} has completed`,
        });
      }
    });

    return () => {
      unsub();
      // Clear badge on cleanup
      window.electronAPI.setDockBadge("");
    };
  }, [settings.notifications]);

  const handleRenameAgent = async (id: string, name: string) => {
    const updated = await window.electronAPI.renameAgent(id, name);
    if (updated) patchAgent(id, { customName: updated.customName });
  };

  const handleResetAgentName = async (id: string) => {
    const updated = await window.electronAPI.resetAgentName(id);
    if (updated) patchAgent(id, { customName: undefined });
  };

  const handleOpenDirectory = async (agentType: AgentType = "claude") => {
    const dir = await window.electronAPI.openDirectoryDialog();
    if (!dir) return;
    const info = await createAgent({ cwd: dir, agentType });
    selectAgent(info.id);
  };

  const handleOpenHome = async (agentType: AgentType = "claude") => {
    const home = await window.electronAPI.getHomePath();
    const info = await createAgent({ cwd: home, agentType });
    selectAgent(info.id);
  };

  const handleResumeSession = async (session: ClaudeSession) => {
    setShowResumeModal(false);
    const info = await createAgent({ cwd: session.cwd, agentType: pendingAgentType });
    await window.electronAPI.updateAgentSession(info.id, session.sessionId);
    patchAgent(info.id, { sessionId: session.sessionId });
    selectAgent(info.id);
  };

  const handleSSHConnect = async (conn: SSHConnection, remotePath: string) => {
    setShowSSHModal(false);
    const info = await createAgent({ cwd: remotePath, ssh: conn, agentType: pendingAgentType });
    selectAgent(info.id);
  };

  // Track PTY activity to set agent state and detect when Claude needs input
  const idleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const activeAgents = useRef<Set<string>>(new Set());
  const outputBuffers = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    // Strip ANSI escape sequences AND cursor movement, then restore spaces.
    // Claude renders spaces as [1C (cursor right), so after stripping we
    // reinsert a space for each cursor-movement sequence.
    const CURSOR_MOVE_RE = /\x1b\[\d*[ABCD]/g;
    const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

    function stripAnsi(s: string): string {
      return s.replace(CURSOR_MOVE_RE, " ").replace(ANSI_RE, "");
    }

    // Detect Claude's interactive permission menu by matching the ❯ selector
    // character followed by a numbered option. This only appears in the
    // rendered interactive prompt, never in code or conversation text.
    const PERMISSION_RE = /❯\s*\d\.\s*Yes/;

    // Detect Claude's idle input prompt — ❯ at the end of output not followed
    // by a numbered option (which would be the permission menu instead).
    const IDLE_PROMPT_RE = /❯\s*$/;

    function classifyPrompt(buffer: string): "permission" | "idle" | null {
      const tail = stripAnsi(buffer.slice(-1000));
      if (PERMISSION_RE.test(tail)) return "permission";
      if (IDLE_PROMPT_RE.test(tail)) return "idle";
      return null;
    }

    // Activity detection signals:
    // 1. Window title OSC: Claude sets braille dots when thinking, ✳ when idle
    // 2. Alt buffer switch: Claude uses DECSET 1049h
    // 3. Sustained high data volume: actual agent work produces lots of output
    //    over several seconds, while TUI redraws and typing are small bursts
    const TITLE_RE = /\x1b\]0;([^\x07]*)\x07/;
    const IDLE_TITLE_CHARS = /^[✳\s]/;
    const ALT_BUFFER_ENTER = /\x1b\[\?1049h/;

    // Track bytes per agent over a rolling window for volume-based detection
    const byteCounters = new Map<string, number>();
    const byteTimers = new Map<string, ReturnType<typeof setTimeout>>();

    // Grace period after startup — ignore initial TUI draws
    const startupTime = Date.now();
    const STARTUP_GRACE_MS = 5000;

    const markRunning = (agentId: string) => {
      activeAgents.current.add(agentId);
      patchAgent(agentId, { state: "running", needsAttention: false });
      setUnreadAgents(prev => {
        if (!prev.has(agentId)) return prev;
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    };

    const removePtyData = window.electronAPI.onPtyData(({ agentId, data }) => {
      // Skip shell terminals — they don't need activity tracking
      if (agentId.endsWith("-shell")) return;

      // Append to rolling buffer (keep last 2KB)
      const prev = outputBuffers.current.get(agentId) ?? "";
      const updated = (prev + data).slice(-2048);
      outputBuffers.current.set(agentId, updated);

      // Skip activity detection during startup grace period
      if (Date.now() - startupTime < STARTUP_GRACE_MS) return;

      // If agent was waiting for input (needsAttention) and data arrives,
      // the user just responded — mark running immediately
      const currentAgent = agents.find(a => a.id === agentId);
      if (currentAgent?.needsAttention && data.length > 20 && !activeAgents.current.has(agentId)) {
        markRunning(agentId);
      }

      // Signal 1: Window title change (Claude-specific)
      const titleMatch = data.match(TITLE_RE);
      if (titleMatch) {
        const title = titleMatch[1];
        const isIdle = IDLE_TITLE_CHARS.test(title);
        if (!isIdle && !activeAgents.current.has(agentId)) {
          markRunning(agentId);
        }
      }

      // Signal 2: Entering alternate buffer (Claude)
      if (ALT_BUFFER_ENTER.test(data)) {
        if (!activeAgents.current.has(agentId)) {
          markRunning(agentId);
        }
      }

      // Signal 3: Sustained data volume (Codex and general).
      // Track total bytes over a 2s window. TUI redraws and typing
      // produce small amounts (<1KB). Active agent work (reading files,
      // generating code) produces several KB over sustained periods.
      const bytes = (byteCounters.get(agentId) ?? 0) + data.length;
      byteCounters.set(agentId, bytes);
      const existingByteTimer = byteTimers.get(agentId);
      if (!existingByteTimer) {
        byteTimers.set(agentId, setTimeout(() => {
          byteCounters.set(agentId, 0);
          byteTimers.delete(agentId);
        }, 2000));
      }

      if (bytes > 1000 && !activeAgents.current.has(agentId)) {
        markRunning(agentId);
      }

      // Reset idle timer — after 800ms of silence, classify the prompt state.
      const existing = idleTimers.current.get(agentId);
      if (existing) clearTimeout(existing);
      idleTimers.current.set(
        agentId,
        setTimeout(() => {
          const buf = outputBuffers.current.get(agentId) ?? "";
          const prompt = classifyPrompt(buf);

          const wasRunning = activeAgents.current.has(agentId);
          activeAgents.current.delete(agentId);
          if (prompt === "permission") {
            patchAgent(agentId, { state: "idle", needsAttention: true });
          } else {
            patchAgent(agentId, { state: "idle", needsAttention: false });
            // Mark as unread if it was running
            if (wasRunning) {
              setUnreadAgents(prev => {
                const next = new Set(prev);
                next.add(agentId);
                return next;
              });
              // Notify if app isn't focused
              if (settings.notifications && !document.hasFocus()) {
                const agent = agents.find(a => a.id === agentId);
                if (agent) {
                  new Notification("Agent finished", {
                    body: `${agent.customName ?? agent.repoName} is waiting for input`,
                  });
                }
              }
            }
          }

          idleTimers.current.delete(agentId);
        }, 800)
      );
    });

    const removePtyExit = window.electronAPI.onPtyExit(({ agentId }) => {
      activeAgents.current.delete(agentId);
      outputBuffers.current.delete(agentId);
      const timer = idleTimers.current.get(agentId);
      if (timer) clearTimeout(timer);
      idleTimers.current.delete(agentId);
      patchAgent(agentId, { state: "stopped", needsAttention: false });
    });

    return () => {
      removePtyData();
      removePtyExit();
      for (const timer of idleTimers.current.values()) clearTimeout(timer);
    };
  }, [patchAgent]);

  // File drag-and-drop — handle at document level to prevent Electron's
  // default file navigation and ensure it works regardless of xterm's DOM layers
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedId) return;
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        const filePath = (file as any).path as string | undefined;
        if (filePath) {
          window.electronAPI.ptyWrite(selectedId, filePath);
        }
      }
    };
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [selectedId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.metaKey && e.shiftKey && e.key === "p") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      if (e.metaKey && e.key === "w") {
        e.preventDefault();
        if (selectedId) {
          destroyTerminal(selectedId);
          removeAgent(selectedId);
          setSelectedId(null);
        }
        return;
      }
      if (e.metaKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        if (index < agents.length) {
          selectAgent(agents[index].id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [agents]);

  return (
    <div style={styles.root}>
      <div style={styles.layout}>
      <div style={{ ...styles.sidebar, width: sidebarWidth }}>
        <div style={styles.agentListArea}>
          <AgentList
            agents={agents}
            selectedId={selectedId}
            unreadAgents={unreadAgents}
            onSelect={selectAgent}
            onClose={(id) => {
              destroyTerminal(id);
              removeAgent(id);
              if (selectedId === id) setSelectedId(null);
            }}
            onReorder={reorderAgents}
          />
        </div>
        <div
          style={styles.sidebarHandle}
          onMouseDown={handleSidebarDragStart}
        />
      </div>

      <div style={styles.main}>
        {agents.length > 0 && (
          <AgentDetail
            agents={agents}
            selectedAgent={selectedAgent}
            terminalFontSize={settings.terminalFontSize}
          />
        )}
        {!selectedAgent && (
          <div style={styles.placeholder}>
            <div style={styles.placeholderContent}>
              <div style={styles.placeholderIcon}>~</div>
              <div style={styles.placeholderText}>Open a directory to get started</div>
              <div style={styles.shortcutList}>
                <div style={styles.shortcutRow}><span style={styles.shortcutKey}>Cmd+Shift+P</span><span>Command palette</span></div>
                <div style={styles.shortcutRow}><span style={styles.shortcutKey}>Cmd+1-9</span><span>Switch agent</span></div>
                <div style={styles.shortcutRow}><span style={styles.shortcutKey}>Cmd+W</span><span>Close agent</span></div>
                <div style={styles.shortcutRow}><span style={styles.shortcutKey}>Cmd+-</span><span>Split terminal</span></div>
                <div style={styles.shortcutRow}><span style={styles.shortcutKey}>Cmd+?</span><span>All shortcuts</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showSSHModal && (
        <SSHConnectModal
          onConnect={handleSSHConnect}
          onClose={() => setShowSSHModal(false)}
        />
      )}

      {showResumeModal && (
        <ResumeSessionModal
          onResume={handleResumeSession}
          onClose={() => setShowResumeModal(false)}
        />
      )}

      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      {showCommandPalette && (
        <CommandPalette
          settings={settings}
          onUpdateSettings={updateSettings}
          onOpenDirectory={handleOpenDirectory}
          onOpenHome={handleOpenHome}
          onResume={(agentType) => { setPendingAgentType(agentType); setShowResumeModal(true); }}
          onSSH={(agentType) => { setPendingAgentType(agentType); setShowSSHModal(true); }}
          onClose={() => setShowCommandPalette(false)}
          selectedAgent={selectedAgent}
          onRenameAgent={handleRenameAgent}
          onResetAgentName={handleResetAgentName}
        />
      )}
      </div>
      {BUILD_CHANNEL !== "release" && (
        <div style={styles.buildBar}>
          {BUILD_CHANNEL} build
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  layout: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: 280,
    flexShrink: 0,
    background: "var(--bg-secondary)",
    display: "flex",
    flexDirection: "row",
    position: "relative",
  },
  sidebarHandle: {
    width: 4,
    cursor: "col-resize",
    background: "transparent",
    borderRight: "1px solid var(--border)",
    flexShrink: 0,
  },
  agentListArea: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  placeholder: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-primary)",
    zIndex: 5,
  },
  placeholderContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  placeholderIcon: {
    fontSize: 32,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    opacity: 0.4,
  },
  placeholderText: {
    color: "var(--text-muted)",
    fontSize: 14,
  },
  shortcutList: {
    marginTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  shortcutRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 12,
    color: "var(--text-muted)",
  },
  shortcutKey: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    background: "var(--bg-tertiary)",
    padding: "2px 6px",
    borderRadius: 3,
    color: "var(--text-secondary)",
    minWidth: 100,
    textAlign: "right" as const,
  },
  buildBar: {
    flexShrink: 0,
    padding: "2px 0",
    background: BUILD_CHANNEL === "local" ? "var(--yellow)" : "var(--accent)",
    color: "#0a0c10",
    fontSize: 10,
    fontWeight: 600,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  } as React.CSSProperties,
};
