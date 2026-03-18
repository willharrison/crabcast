import { useState, useRef, useEffect, useCallback } from "react";
import type { AgentInfo } from "../../shared/types.js";

const SPINNER_FRAMES = ["·", "✻", "✽", "✶", "✳", "✢"];

function Spinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 180);
    return () => clearInterval(interval);
  }, []);

  return <span style={styles.spinner}>{SPINNER_FRAMES[frame]}</span>;
}

interface Props {
  agents: AgentInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

interface GitCounts {
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
}

const stateColors: Record<string, string> = {
  running: "var(--green)",
  idle: "var(--text-muted)",
  stopped: "var(--text-muted)",
  error: "var(--red)",
};

function useGitCounts(agents: AgentInfo[]) {
  const [counts, setCounts] = useState<Record<string, GitCounts>>({});

  useEffect(() => {
    const fetchAll = async () => {
      const next: Record<string, GitCounts> = {};
      for (const agent of agents) {
        if (agent.ssh) continue;
        try {
          const statuses = await window.electronAPI.getGitFileStatuses(agent.cwd);
          const c: GitCounts = { modified: 0, added: 0, deleted: 0, untracked: 0 };
          for (const status of Object.values(statuses)) {
            if (status === "M") c.modified++;
            else if (status === "A") c.added++;
            else if (status === "D") c.deleted++;
            else if (status === "?") c.untracked++;
          }
          next[agent.id] = c;
        } catch { /* ignore */ }
      }
      setCounts(next);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [agents.map((a) => a.id + a.cwd).join(",")]);

  return counts;
}

export function AgentList({
  agents,
  selectedId,
  onSelect,
  onClose,
  onAdd,
  onReorder,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLButtonElement | null>(null);
  const gitCounts = useGitCounts(agents);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget as HTMLButtonElement;
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex === null || index === dragIndex) return;
    setDropIndex(index);
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex) {
      onReorder(dragIndex, dropIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
    dragNode.current = null;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header} className="drag-region">
        <button onClick={onAdd} className="btn-ghost" style={styles.addBtn}>
          +
        </button>
      </div>

      <div style={styles.list}>
        {agents.length === 0 && (
          <div style={styles.empty}>
            <span style={styles.emptyIcon}>+</span>
            <span>Open a directory to begin</span>
          </div>
        )}
        {agents.map((agent, index) => {
          const isSelected = agent.id === selectedId;
          const isDragTarget = dropIndex === index && dragIndex !== null;
          const gc = gitCounts[agent.id];
          const hasChanges = gc && (gc.modified + gc.added + gc.deleted + gc.untracked) > 0;

          return (
            <button
              key={agent.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelect(agent.id)}
              className="sidebar-item"
              style={{
                ...styles.item,
                background: isSelected
                  ? "var(--bg-tertiary)"
                  : isDragTarget
                    ? "var(--bg-tertiary)"
                    : "transparent",
                borderLeft: "none",
                boxShadow: isDragTarget && dragIndex! > index
                  ? "inset 0 2px 0 var(--accent)"
                  : undefined,
              }}
            >
              <div style={styles.itemTop}>
                <span style={styles.indicator}>
                  {agent.needsAttention ? (
                    <span style={styles.attentionIcon}>!</span>
                  ) : agent.state === "running" ? (
                    <Spinner />
                  ) : (
                    <span style={{
                      ...styles.dot,
                      background: stateColors[agent.state] ?? "var(--text-muted)",
                    }} />
                  )}
                </span>
                <span style={styles.repoName}>{agent.customName ?? agent.repoName}</span>
                {agent.ssh && (
                  <span style={styles.sshBadge}>SSH</span>
                )}
                {index < 9 && (
                  <span style={styles.shortcut}>{index + 1}</span>
                )}
                <span
                  className="close-btn"
                  style={styles.itemClose}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(agent.id);
                  }}
                >
                  &times;
                </span>
              </div>
              <div style={styles.meta}>
                {agent.gitBranch && (
                  <span style={styles.branch}>{agent.gitBranch}</span>
                )}
                {agent.ssh && (
                  <span style={styles.sshHost}>
                    {agent.ssh.user}@{agent.ssh.host}
                  </span>
                )}
                {hasChanges && (
                  <span style={styles.gitChanges}>
                    {gc.modified > 0 && <span style={styles.gitM}>{gc.modified}M</span>}
                    {gc.added > 0 && <span style={styles.gitA}>{gc.added}A</span>}
                    {gc.deleted > 0 && <span style={styles.gitD}>{gc.deleted}D</span>}
                    {gc.untracked > 0 && <span style={styles.gitU}>{gc.untracked}U</span>}
                  </span>
                )}
              </div>
              <div style={styles.cwd}>{agent.cwd}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "10px 14px 10px 78px",
    borderBottom: "1px solid var(--border)",
  },
  addBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 18,
    fontWeight: 300,
    lineHeight: 1,
    padding: "0 4px",
  },
  list: {
    flex: 1,
    overflowY: "auto",
  },
  empty: {
    padding: "32px 20px",
    color: "var(--text-muted)",
    textAlign: "center",
    fontSize: 13,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  emptyIcon: {
    fontSize: 20,
    opacity: 0.4,
    fontFamily: "var(--font-mono)",
  },
  item: {
    display: "block",
    width: "100%",
    padding: "8px 12px",
    border: "none",
    textAlign: "left",
    color: "var(--text-primary)",
    cursor: "grab",
  },
  itemTop: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    marginBottom: 3,
  },
  indicator: {
    width: 10,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
  },
  spinner: {
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    color: "var(--green)",
  },
  attentionIcon: {
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    color: "var(--yellow)",
  },
  sshBadge: {
    fontSize: 9,
    fontWeight: 700,
    color: "var(--cyan)",
    background: "rgba(86, 212, 221, 0.1)",
    padding: "1px 4px",
    borderRadius: 2,
    letterSpacing: "0.04em",
    flexShrink: 0,
  },
  repoName: {
    fontWeight: 600,
    fontSize: 13,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shortcut: {
    fontSize: 10,
    color: "var(--text-muted)",
    background: "var(--bg-primary)",
    padding: "0px 5px",
    borderRadius: 2,
    fontFamily: "var(--font-mono)",
    flexShrink: 0,
    lineHeight: "16px",
  },
  itemClose: {
    fontSize: 14,
    color: "var(--text-muted)",
    opacity: 0,
    flexShrink: 0,
    lineHeight: 1,
    padding: "0 2px",
    cursor: "pointer",
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginLeft: 17,
    marginBottom: 1,
  },
  branch: {
    fontSize: 11,
    color: "var(--accent)",
    fontFamily: "var(--font-mono)",
  },
  sshHost: {
    fontSize: 11,
    color: "var(--cyan)",
    fontFamily: "var(--font-mono)",
  },
  gitChanges: {
    display: "flex",
    gap: 4,
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
  },
  gitM: {
    color: "var(--yellow)",
  },
  gitA: {
    color: "var(--green)",
  },
  gitD: {
    color: "var(--red)",
  },
  gitU: {
    color: "var(--text-muted)",
  },
  cwd: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    marginLeft: 17,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
