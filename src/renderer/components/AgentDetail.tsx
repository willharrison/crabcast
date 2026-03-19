import { useState } from "react";
import type { AgentInfo } from "../../shared/types.js";
import { Terminal } from "./Terminal.js";
import { ClaudeMdEditor } from "./ClaudeMdEditor.js";

interface Props {
  agents: AgentInfo[];
  selectedAgent: AgentInfo | null;
  terminalFontSize?: number;
}

export function AgentDetail({ agents, selectedAgent, terminalFontSize }: Props) {
  const [showClaudeMd, setShowClaudeMd] = useState(false);

  return (
    <div style={styles.container}>
      {/* Header — only show when an agent is selected */}
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
              onClick={() => setShowClaudeMd(true)}
              className="btn-ghost"
              style={styles.claudeMdBtn}
            >
              CLAUDE.md
            </button>
          </div>
        </div>
      )}

      {/* All terminals rendered, only selected is visible */}
      {agents.map((agent) => (
        <Terminal
          key={agent.id}
          agentId={agent.id}
          cwd={agent.cwd}
          ssh={agent.ssh}
          sessionId={agent.sessionId}
          agentType={agent.agentType}
          fontSize={terminalFontSize}
          visible={selectedAgent?.id === agent.id}
        />
      ))}

      {/* CLAUDE.md editor modal */}
      {showClaudeMd && selectedAgent && (
        <ClaudeMdEditor
          cwd={selectedAgent.cwd}
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
};
