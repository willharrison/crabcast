import { useState, useEffect, useRef, useCallback } from "react";
import { useAgents } from "./hooks/useAgents.js";
import { useSettings } from "./hooks/useSettings.js";
import { AgentList } from "./components/AgentList.js";
import { AgentDetail } from "./components/AgentDetail.js";
import { GitStatus } from "./components/GitStatus.js";
import { DirectoryExplorer } from "./components/DirectoryExplorer.js";
import { destroyTerminal } from "./components/Terminal.js";
import { SSHConnectModal } from "./components/SSHConnectModal.js";
import { ResumeSessionModal } from "./components/ResumeSessionModal.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { AddAgentMenu } from "./components/AddAgentMenu.js";
import type { SSHConnection, ClaudeSession } from "../shared/types.js";

type SidebarPanel = "git" | "files" | null;

const BUILD_CHANNEL = (import.meta.env.VITE_BUILD_CHANNEL as string) || "local";

export function App() {
  const { agents, createAgent, stopAgent, removeAgent, patchAgent, reorderAgents } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSSHModal, setShowSSHModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(null);
  const [panelHeight, setPanelHeight] = useState(() => {
    const saved = localStorage.getItem("panelHeight");
    return saved ? parseInt(saved, 10) : 300;
  });
  const { settings, updateSettings } = useSettings();
  const draggingRef = useRef(false);

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  // Persist panel height
  useEffect(() => {
    localStorage.setItem("panelHeight", String(panelHeight));
  }, [panelHeight]);

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

  const handleOpenDirectory = async () => {
    const dir = await window.electronAPI.openDirectoryDialog();
    if (!dir) return;
    const info = await createAgent({ cwd: dir });
    setSelectedId(info.id);
  };

  const handleResumeSession = async (session: ClaudeSession) => {
    setShowResumeModal(false);
    const info = await createAgent({ cwd: session.cwd });
    await window.electronAPI.updateAgentSession(info.id, session.sessionId);
    patchAgent(info.id, { sessionId: session.sessionId });
    setSelectedId(info.id);
  };

  const handleSSHConnect = async (conn: SSHConnection, remotePath: string) => {
    setShowSSHModal(false);
    const info = await createAgent({ cwd: remotePath, ssh: conn });
    setSelectedId(info.id);
  };

  // Drag to resize the bottom panel
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startY = e.clientY;
    const startH = panelHeight;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startY - ev.clientY;
      setPanelHeight(Math.max(100, Math.min(600, startH + delta)));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [panelHeight]);

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

    // Claude's thinking/working spinner characters.
    // Strip OSC sequences (like window title: ]0;✳ Claude Code) first,
    // since those contain ✳ even when Claude is idle.
    const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
    const THINKING_RE = /[✻✽✶✳✢✸◐⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;

    const removePtyData = window.electronAPI.onPtyData(({ agentId, data }) => {
      // Append to rolling buffer (keep last 2KB)
      const prev = outputBuffers.current.get(agentId) ?? "";
      const updated = (prev + data).slice(-2048);
      outputBuffers.current.set(agentId, updated);

      // Only mark as running if the output contains Claude's thinking characters
      // (after stripping window title sequences which always contain ✳)
      const stripped = data.replace(OSC_RE, "");
      if (THINKING_RE.test(stripped)) {
        if (!activeAgents.current.has(agentId)) {
          activeAgents.current.add(agentId);
          patchAgent(agentId, { state: "running", needsAttention: false });
        }
      }

      // Reset idle timer — after 500ms of silence, classify the prompt state
      const existing = idleTimers.current.get(agentId);
      if (existing) clearTimeout(existing);
      idleTimers.current.set(
        agentId,
        setTimeout(() => {
          const buf = outputBuffers.current.get(agentId) ?? "";
          const prompt = classifyPrompt(buf);

          if (prompt === "permission") {
            // Claude is showing a permission/tool approval menu
            activeAgents.current.delete(agentId);
            patchAgent(agentId, { state: "idle", needsAttention: true });
          } else if (prompt === "idle") {
            // Claude is at the ❯ input prompt — truly done
            activeAgents.current.delete(agentId);
            patchAgent(agentId, { state: "idle", needsAttention: false });
          }
          // else: no prompt detected — Claude is mid-operation, don't change state

          idleTimers.current.delete(agentId);
        }, 500)
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === "p") {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      if (e.metaKey && e.key === "g") {
        e.preventDefault();
        setSidebarPanel((v) => (v === "git" ? null : "git"));
        return;
      }
      if (e.metaKey && e.key === "f") {
        e.preventDefault();
        setSidebarPanel((v) => (v === "files" ? null : "files"));
        return;
      }
      if (e.key === "Escape" && sidebarPanel) {
        setSidebarPanel(null);
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
          setSelectedId(agents[index].id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [agents, sidebarPanel]);

  return (
    <div style={styles.root}>
      <div style={styles.layout}>
      <div style={styles.sidebar}>
        {/* Agent list — always visible */}
        <div style={styles.agentListArea}>
          <AgentList
            agents={agents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onClose={(id) => {
              destroyTerminal(id);
              removeAgent(id);
              if (selectedId === id) setSelectedId(null);
            }}
            onAdd={() => setShowAddMenu((v) => !v)}
            onReorder={reorderAgents}
          />
          {showAddMenu && (
            <AddAgentMenu
              onOpenDirectory={() => { setShowAddMenu(false); handleOpenDirectory(); }}
              onResume={() => { setShowAddMenu(false); setShowResumeModal(true); }}
              onSSH={() => { setShowAddMenu(false); setShowSSHModal(true); }}
              onClose={() => setShowAddMenu(false)}
            />
          )}
        </div>

        {/* Bottom panel — Git or Files */}
        {sidebarPanel && (
          <>
            {/* Drag handle */}
            <div
              style={styles.dragHandle}
              onMouseDown={handleDragStart}
            >
              <div style={styles.dragBar} />
            </div>

            <div style={{ ...styles.bottomPanel, height: panelHeight }}>
              {sidebarPanel === "git" && selectedAgent ? (
                <GitStatus
                  cwd={selectedAgent.cwd}
                  ssh={selectedAgent.ssh}
                  onClose={() => setSidebarPanel(null)}
                />
              ) : sidebarPanel === "files" && selectedAgent ? (
                <DirectoryExplorer
                  cwd={selectedAgent.cwd}
                  ssh={selectedAgent.ssh}
                  onClose={() => setSidebarPanel(null)}
                />
              ) : (
                <div style={styles.noAgent}>Select an agent first</div>
              )}
            </div>
          </>
        )}

        {/* Tab bar — Git and Files only */}
        <div style={styles.tabBar}>
          <button
            onClick={() => setSidebarPanel((v) => (v === "git" ? null : "git"))}
            className="panel-toggle"
            style={{
              ...styles.tab,
              color: sidebarPanel === "git" ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            <span style={styles.underline}>G</span>it
          </button>
          <button
            onClick={() => setSidebarPanel((v) => (v === "files" ? null : "files"))}
            className="panel-toggle"
            style={{
              ...styles.tab,
              color: sidebarPanel === "files" ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            <span style={styles.underline}>F</span>iles
          </button>
        </div>
      </div>

      <div style={styles.main}>
        {agents.length > 0 ? (
          <AgentDetail
            agents={agents}
            selectedAgent={selectedAgent}
            terminalFontSize={settings.terminalFontSize}
          />
        ) : (
          <div style={styles.placeholder}>
            <div style={styles.placeholderContent}>
              <div style={styles.placeholderIcon}>~</div>
              <div style={styles.placeholderText}>Open a directory to get started</div>
              <div style={styles.placeholderHint}>Cmd+Shift+P for commands &middot; Cmd+1-9 to switch</div>
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

      {showCommandPalette && (
        <CommandPalette
          settings={settings}
          onUpdateSettings={updateSettings}
          onOpenDirectory={handleOpenDirectory}
          onResume={() => setShowResumeModal(true)}
          onSSH={() => setShowSSHModal(true)}
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
    flexDirection: "column",
    borderRight: "1px solid var(--border)",
  },
  agentListArea: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  bottomPanel: {
    flexShrink: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  dragHandle: {
    flexShrink: 0,
    height: 6,
    cursor: "row-resize",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderTop: "1px solid var(--border-subtle)",
  },
  dragBar: {
    width: 32,
    height: 2,
    borderRadius: 1,
    background: "var(--border)",
  },
  tabBar: {
    display: "flex",
    borderTop: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: "6px 8px",
    background: "transparent",
    border: "none",
    borderRight: "1px solid var(--border-subtle)",
    fontSize: 11,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  underline: {
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  noAgent: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    fontSize: 12,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  placeholder: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
  placeholderHint: {
    color: "var(--text-muted)",
    fontSize: 12,
    opacity: 0.6,
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
