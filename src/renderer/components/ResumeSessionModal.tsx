import { useState, useEffect, useRef, useCallback } from "react";
import type { ClaudeSession } from "../../shared/types.js";

interface Props {
  onResume: (session: ClaudeSession) => void;
  onClose: () => void;
}

export function ResumeSessionModal({ onResume, onClose }: Props) {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.listClaudeSessions().then((s) => {
      setSessions(s);
      setLoading(false);
    });
  }, []);

  const filtered = filter
    ? sessions.filter((s) => s.cwd.toLowerCase().includes(filter.toLowerCase()))
    : sessions;

  // Group by cwd
  const grouped = new Map<string, ClaudeSession[]>();
  for (const s of filtered) {
    const existing = grouped.get(s.cwd);
    if (existing) {
      existing.push(s);
    } else {
      grouped.set(s.cwd, [s]);
    }
  }

  // Flat list for keyboard navigation
  const flatSessions = Array.from(grouped.values()).flat();

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatSessions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatSessions.length > 0) {
        e.preventDefault();
        onResume(flatSessions[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [flatSessions, selectedIndex, onResume, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    const now = Date.now();
    const diff = now - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>Resume Session</h3>
          <button onClick={onClose} className="btn-ghost" style={styles.closeBtn}>
            Close
          </button>
        </div>

        <div style={styles.filterBar}>
          <input
            style={styles.filterInput}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter by directory..."
            autoFocus
          />
        </div>

        <div style={styles.list} ref={listRef}>
          {loading ? (
            <div style={styles.empty}>Loading sessions...</div>
          ) : filtered.length === 0 ? (
            <div style={styles.empty}>No sessions found</div>
          ) : (
            (() => {
              let flatIdx = 0;
              return Array.from(grouped.entries()).map(([cwd, cwdSessions]) => (
                <div key={cwd}>
                  <div style={styles.cwdHeader}>
                    {cwd.split("/").pop() || cwd}
                    <span style={styles.cwdPath}>{cwd}</span>
                  </div>
                  {cwdSessions.map((s) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={s.sessionId}
                        data-index={idx}
                        className="sidebar-item"
                        style={{
                          ...styles.sessionItem,
                          ...(idx === selectedIndex ? styles.sessionItemSelected : {}),
                        }}
                        onClick={() => onResume(s)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <span style={styles.sessionId}>{s.sessionId.slice(0, 8)}</span>
                        <span style={styles.sessionTime}>{formatTime(s.modifiedAt)}</span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>
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
    maxWidth: 520,
    maxHeight: "80%",
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
    padding: "14px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
  },
  closeBtn: {
    padding: "5px 12px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    fontSize: 12,
  },
  filterBar: {
    padding: "8px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  filterInput: {
    width: "100%",
    padding: "8px 10px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    outline: "none",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    minHeight: 200,
    maxHeight: 400,
  },
  empty: {
    padding: 20,
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 12,
  },
  cwdHeader: {
    padding: "8px 14px 4px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  cwdPath: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    fontWeight: 400,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  sessionItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "6px 14px 6px 24px",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    fontSize: 12,
    textAlign: "left",
  },
  sessionId: {
    fontFamily: "var(--font-mono)",
    color: "var(--accent)",
    fontSize: 12,
  },
  sessionItemSelected: {
    background: "var(--bg-tertiary)",
  },
  sessionTime: {
    fontSize: 11,
    color: "var(--text-muted)",
  },
};
