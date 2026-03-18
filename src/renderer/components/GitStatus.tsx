import { useState, useEffect } from "react";
import type { GitInfo, SSHConnection } from "../../shared/types.js";

interface Props {
  cwd: string;
  ssh?: SSHConnection;
  onClose: () => void;
}

export function GitStatus({ cwd, ssh, onClose }: Props) {
  const [info, setInfo] = useState<GitInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchInfo = () => {
      const promise = ssh
        ? window.electronAPI.sshGetGitInfo(ssh, cwd)
        : window.electronAPI.getGitInfo(cwd);

      promise.then((data) => {
        if (!cancelled) setInfo(data);
      });
    };

    fetchInfo();
    const interval = setInterval(fetchInfo, ssh ? 15000 : 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cwd, ssh]);

  return (
    <div style={styles.container}>
      <div style={styles.titleBar}>
        <span style={styles.title}>Git</span>
        <button onClick={onClose} className="close-btn" style={styles.closeBtn}>
          &times;
        </button>
      </div>

      <div style={styles.body}>
        {!info ? (
          <div style={styles.loading}>Loading git info...</div>
        ) : (
          <>
            <div style={styles.row}>
              <span style={styles.label}>Branch</span>
              <span style={styles.branch}>{info.branch}</span>
              {info.dirty && <span style={styles.dirty}>modified</span>}
            </div>

            {info.status && (
              <div style={styles.section}>
                <span style={styles.label}>Changes</span>
                <pre style={styles.pre}>{info.status}</pre>
              </div>
            )}

            {info.recentLog.length > 0 && (
              <div style={styles.section}>
                <span style={styles.label}>Recent Commits</span>
                {info.recentLog.slice(0, 5).map((entry) => (
                  <div key={entry.hash} style={styles.logEntry}>
                    <span style={styles.hash}>{entry.hash}</span>
                    <span style={styles.subject}>{entry.subject}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
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
    background: "var(--bg-secondary)",
  },
  titleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    flexShrink: 0,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 16,
    padding: "0 2px",
    lineHeight: 1,
  },
  body: {
    padding: "10px 14px",
    fontSize: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
  },
  loading: {
    color: "var(--text-muted)",
    fontSize: 12,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  label: {
    color: "var(--text-muted)",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    minWidth: 50,
    fontWeight: 600,
  },
  branch: {
    color: "var(--accent)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
  },
  dirty: {
    color: "var(--yellow)",
    fontSize: 10,
    padding: "1px 5px",
    background: "var(--yellow-dim)",
    borderRadius: 2,
    fontWeight: 600,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  pre: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text-secondary)",
    margin: 0,
    whiteSpace: "pre-wrap" as const,
    lineHeight: 1.5,
  },
  logEntry: {
    display: "flex",
    gap: 8,
    fontSize: 12,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  hash: {
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
    flexShrink: 0,
    fontSize: 11,
  },
  subject: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
