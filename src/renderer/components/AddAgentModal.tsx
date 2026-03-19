import { useState, useEffect } from "react";
import type { AgentType } from "../../shared/types.js";

interface Props {
  onOpenDirectory: (agentType: AgentType) => void;
  onResume: (agentType: AgentType) => void;
  onSSH: (agentType: AgentType) => void;
  onClose: () => void;
}

export function AddAgentModal({ onOpenDirectory, onResume, onSSH, onClose }: Props) {
  const [selectedType, setSelectedType] = useState<AgentType | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>New Agent</h3>
          <button onClick={onClose} className="btn-ghost" style={styles.closeBtn}>
            &times;
          </button>
        </div>

        {!selectedType ? (
          <div style={styles.body}>
            <div style={styles.hint}>Choose agent type</div>
            <div style={styles.typeRow}>
              <button
                className="btn-ghost"
                style={styles.typeBtn}
                onClick={() => setSelectedType("claude")}
              >
                <span style={styles.typeName}>Claude</span>
                <span style={styles.typeDesc}>Anthropic Claude Code CLI</span>
              </button>
              <button
                className="btn-ghost"
                style={styles.typeBtn}
                onClick={() => setSelectedType("codex")}
              >
                <span style={styles.typeName}>Codex</span>
                <span style={styles.typeDesc}>OpenAI Codex CLI</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.body}>
            <div style={styles.hint}>
              <button
                className="btn-ghost"
                style={styles.backBtn}
                onClick={() => setSelectedType(null)}
              >
                &larr;
              </button>
              {selectedType === "claude" ? "Claude" : "Codex"} &mdash; choose action
            </div>
            <div style={styles.actionList}>
              <button
                className="sidebar-item"
                style={styles.actionBtn}
                onClick={() => { onOpenDirectory(selectedType); onClose(); }}
              >
                Open Directory
              </button>
              <button
                className="sidebar-item"
                style={styles.actionBtn}
                onClick={() => { onSSH(selectedType); onClose(); }}
              >
                SSH Remote
              </button>
              <button
                className="sidebar-item"
                style={styles.actionBtn}
                onClick={() => { onResume(selectedType); onClose(); }}
              >
                Resume Session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    backdropFilter: "blur(4px)",
  },
  modal: {
    width: "80%",
    maxWidth: 360,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 18,
    lineHeight: 1,
    padding: "0 4px",
    cursor: "pointer",
  },
  body: {
    padding: "16px",
  },
  hint: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  typeRow: {
    display: "flex",
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: "16px 12px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    color: "var(--text-primary)",
  },
  typeName: {
    fontSize: 14,
    fontWeight: 600,
  },
  typeDesc: {
    fontSize: 11,
    color: "var(--text-muted)",
  },
  backBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 14,
    padding: "0 4px",
    cursor: "pointer",
    lineHeight: 1,
  },
  actionList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  actionBtn: {
    display: "block",
    width: "100%",
    padding: "10px 14px",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
    borderRadius: "var(--radius-sm)",
  },
};
