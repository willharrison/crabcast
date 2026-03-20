import { useState, useEffect, useRef, useCallback } from "react";
import type { AgentInfo } from "../../shared/types.js";
import { Terminal, destroyTerminal, scrollTerminalToBottom } from "./Terminal.js";
import { ClaudeMdEditor } from "./ClaudeMdEditor.js";

interface Props {
  agents: AgentInfo[];
  selectedAgent: AgentInfo | null;
  terminalFontSize?: number;
}

export function AgentDetail({ agents, selectedAgent, terminalFontSize }: Props) {
  const [showClaudeMd, setShowClaudeMd] = useState(false);
  const [splitAgents, setSplitAgents] = useState<Set<string>>(new Set());
  // Split ratio: 0.0 = all agent, 1.0 = all shell. Default 0.35 = 35% shell.
  const [splitRatio, setSplitRatio] = useState(0.35);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const isSplit = selectedAgent ? splitAgents.has(selectedAgent.id) : false;

  const toggleSplit = useCallback(() => {
    if (!selectedAgent) return;
    setSplitAgents(prev => {
      const next = new Set(prev);
      if (next.has(selectedAgent.id)) {
        next.delete(selectedAgent.id);
        destroyTerminal(`${selectedAgent.id}-shell`);
        // Focus back to agent terminal
        setTimeout(() => {
          const agentTerm = document.querySelector(`[data-terminal-id="${selectedAgent.id}"]`);
          const textarea = agentTerm?.querySelector(".xterm-helper-textarea") as HTMLElement;
          textarea?.focus();
        }, 50);
      } else {
        next.add(selectedAgent.id);
        // Scroll agent terminal to bottom after the resize/fit settles.
        // The split changes flex ratio → ResizeObserver fires fit() at 100ms delay,
        // so we need to scroll after that completes.
        setTimeout(() => scrollTerminalToBottom(selectedAgent.id), 300);
      }
      return next;
    });
  }, [selectedAgent]);

  // Keyboard shortcuts for split — use capture to intercept before xterm
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "-") {
        e.preventDefault();
        e.stopPropagation();
        toggleSplit();
        return;
      }
      if (e.metaKey && e.key === "ArrowUp" && isSplit) {
        e.preventDefault();
        e.stopPropagation();
        // Focus the agent terminal
        const agentTerm = document.querySelector(`[data-terminal-id="${selectedAgent?.id}"]`);
        const textarea = agentTerm?.querySelector(".xterm-helper-textarea") as HTMLElement;
        textarea?.focus();
        return;
      }
      if (e.metaKey && e.key === "ArrowDown" && isSplit) {
        e.preventDefault();
        e.stopPropagation();
        // Focus the shell terminal
        const shellTerm = document.querySelector(`[data-terminal-id="${selectedAgent?.id}-shell"]`);
        const textarea = shellTerm?.querySelector(".xterm-helper-textarea") as HTMLElement;
        textarea?.focus();
        return;
      }
    };
    window.addEventListener("keydown", handleKey, { capture: true });
    return () => window.removeEventListener("keydown", handleKey, { capture: true });
  }, [toggleSplit, isSplit, selectedAgent]);

  // Drag to resize split by ratio
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !container) return;
      const rect = container.getBoundingClientRect();
      // Calculate ratio based on mouse position within the terminal area
      const mouseY = ev.clientY - rect.top;
      const ratio = 1 - (mouseY / rect.height);
      setSplitRatio(Math.max(0.15, Math.min(0.85, ratio)));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div style={styles.container}>
      {/* Header */}
      {selectedAgent && (
        <div style={styles.header} className="drag-region">
          <div style={styles.headerInfo}>
            <h2 style={styles.repoName}>{selectedAgent.customName ?? selectedAgent.repoName}</h2>
            <span style={styles.cwd}>
              {selectedAgent.ssh
                ? `${selectedAgent.ssh.user}@${selectedAgent.ssh.host}:${selectedAgent.cwd}`
                : selectedAgent.cwd}
            </span>
          </div>
          <div style={styles.headerActions}>
            <button
              onClick={toggleSplit}
              className="btn-ghost"
              style={{
                ...styles.splitBtn,
                color: isSplit ? "var(--accent)" : "var(--text-muted)",
              }}
              title="Toggle terminal (Cmd+-)"
            >
              ⊞
            </button>
            <button
              onClick={() => setShowClaudeMd(true)}
              className="btn-ghost"
              style={styles.claudeMdBtn}
            >
              {selectedAgent.agentType === "codex" ? "AGENTS.md" : "CLAUDE.md"}
            </button>
          </div>
        </div>
      )}

      {/* Terminal area */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {agents.map((agent) => {
          const isVisible = selectedAgent?.id === agent.id;
          const hasSplit = splitAgents.has(agent.id);

          return (
            <div
              key={agent.id}
              style={{
                display: isVisible ? "flex" : "none",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
              }}
            >
              {/* Agent terminal */}
              <div
                data-terminal-id={agent.id}
                style={{ flex: hasSplit ? `${1 - splitRatio}` : 1, minHeight: 0, overflow: "hidden" }}
              >
                <Terminal
                  agentId={agent.id}
                  cwd={agent.cwd}
                  ssh={agent.ssh}
                  sessionId={agent.sessionId}
                  agentType={agent.agentType}
                  fontSize={terminalFontSize}
                  visible={isVisible}
                />
              </div>

              {/* Split shell terminal */}
              {hasSplit && (
                <>
                  <div
                    style={styles.splitHandle}
                    onMouseDown={handleDragStart}
                  >
                    <div style={styles.splitBar} />
                  </div>
                  <div
                    data-terminal-id={`${agent.id}-shell`}
                    style={{ flex: `${splitRatio}`, minHeight: 0, overflow: "hidden" }}
                  >
                    <Terminal
                      agentId={`${agent.id}-shell`}
                      cwd={agent.cwd}
                      agentType="shell"
                      fontSize={terminalFontSize}
                      visible={isVisible}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Instruction file editor */}
      {showClaudeMd && selectedAgent && (
        <ClaudeMdEditor
          cwd={selectedAgent.cwd}
          fileName={selectedAgent.agentType === "codex" ? "AGENTS.md" : "CLAUDE.md"}
          onClose={() => setShowClaudeMd(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    position: "relative",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--bg-secondary)",
    flexShrink: 0,
  },
  headerInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    minWidth: 0,
  },
  repoName: {
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
  },
  cwd: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  splitBtn: {
    padding: "5px 8px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: 13,
    lineHeight: 1,
  },
  claudeMdBtn: {
    padding: "5px 10px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--accent)",
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
  },
  splitHandle: {
    flexShrink: 0,
    height: 8,
    cursor: "row-resize",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-secondary)",
    borderTop: "1px solid var(--border-subtle)",
    borderBottom: "1px solid var(--border-subtle)",
    position: "relative",
    zIndex: 10,
  },
  splitBar: {
    width: 32,
    height: 2,
    borderRadius: 1,
    background: "var(--border)",
  },
};
