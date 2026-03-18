import { useState, useEffect } from "react";
import type { SSHConnection, RemoteDirEntry } from "../../shared/types.js";

interface Props {
  onConnect: (conn: SSHConnection, remotePath: string) => void;
  onClose: () => void;
}

type Step = "connect" | "browse";

export function SSHConnectModal({ onConnect, onClose }: Props) {
  const [step, setStep] = useState<Step>("connect");
  const [input, setInput] = useState("");
  const [port, setPort] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [recentConnections, setRecentConnections] = useState<SSHConnection[]>([]);
  const [connection, setConnection] = useState<SSHConnection | null>(null);

  // Browse state
  const [currentPath, setCurrentPath] = useState("/home");
  const [entries, setEntries] = useState<RemoteDirEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.electronAPI.sshGetRecentConnections().then(setRecentConnections);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const parseInput = (val: string): { user: string; host: string } | null => {
    const match = val.trim().match(/^([^@]+)@(.+)$/);
    if (!match) return null;
    return { user: match[1], host: match[2] };
  };

  const handleTest = async () => {
    const parsed = parseInput(input);
    if (!parsed) {
      setError("Format: user@host");
      return;
    }

    const conn: SSHConnection = {
      user: parsed.user,
      host: parsed.host,
      port: port ? parseInt(port, 10) : undefined,
    };

    setTesting(true);
    setError("");

    const result = await window.electronAPI.sshTest(conn);
    setTesting(false);

    if (result.ok) {
      setConnection(conn);
      setStep("browse");
      setCurrentPath(`/home/${conn.user}`);
      loadDir(conn, `/home/${conn.user}`);
    } else {
      setError(result.error ?? "Connection failed");
    }
  };

  const selectRecent = (conn: SSHConnection) => {
    setInput(`${conn.user}@${conn.host}`);
    setPort(conn.port && conn.port !== 22 ? String(conn.port) : "");
  };

  const loadDir = async (conn: SSHConnection, dirPath: string) => {
    setLoading(true);
    try {
      const items = await window.electronAPI.sshListDir(conn, dirPath);
      setEntries(items);
      setCurrentPath(dirPath);
    } catch {
      setError("Failed to list directory");
    }
    setLoading(false);
  };

  const navigateTo = (name: string) => {
    if (!connection) return;
    const newPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
    loadDir(connection, newPath);
  };

  const navigateUp = () => {
    if (!connection) return;
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    loadDir(connection, parent);
  };

  const handleSelect = () => {
    if (connection) {
      onConnect(connection, currentPath);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {step === "connect" ? (
          <>
            <div style={styles.header}>
              <h3 style={styles.title}>SSH Connection</h3>
              <button onClick={onClose} className="btn-ghost" style={styles.closeBtn}>
                Close
              </button>
            </div>

            <div style={styles.body}>
              <div style={styles.field}>
                <label style={styles.label}>Connection</label>
                <input
                  style={styles.input}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="user@hostname"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleTest(); }}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Port (optional)</label>
                <input
                  style={{ ...styles.input, width: 100 }}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="22"
                  onKeyDown={(e) => { if (e.key === "Enter") handleTest(); }}
                />
              </div>

              {error && <div style={styles.error}>{error}</div>}

              <button
                onClick={handleTest}
                disabled={testing || !input.includes("@")}
                className="btn-primary"
                style={{
                  ...styles.connectBtn,
                  opacity: testing || !input.includes("@") ? 0.5 : 1,
                }}
              >
                {testing ? "Connecting..." : "Connect"}
              </button>

              {recentConnections.length > 0 && (
                <div style={styles.recentSection}>
                  <div style={styles.recentTitle}>Recent Connections</div>
                  {recentConnections.map((conn, i) => (
                    <button
                      key={i}
                      onClick={() => selectRecent(conn)}
                      className="sidebar-item"
                      style={styles.recentItem}
                    >
                      <span style={styles.recentHost}>{conn.user}@{conn.host}</span>
                      {conn.port && conn.port !== 22 && (
                        <span style={styles.recentPort}>:{conn.port}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={styles.header}>
              <div style={styles.headerLeft}>
                <h3 style={styles.title}>Select Directory</h3>
                <span style={styles.sshLabel}>
                  {connection!.user}@{connection!.host}
                </span>
              </div>
              <div style={styles.headerRight}>
                <button onClick={() => setStep("connect")} className="btn-ghost" style={styles.backBtn}>
                  Back
                </button>
                <button onClick={onClose} className="btn-ghost" style={styles.closeBtn}>
                  Close
                </button>
              </div>
            </div>

            <div style={styles.pathBar}>
              <span style={styles.pathLabel}>{currentPath}</span>
            </div>

            <div style={styles.dirList}>
              {loading ? (
                <div style={styles.loadingText}>Loading...</div>
              ) : (
                <>
                  <button className="tree-row" style={styles.dirItem} onClick={navigateUp}>
                    <span style={styles.dirArrow}>▸</span>
                    <span style={styles.dirItemName}>..</span>
                  </button>
                  {entries.map((entry) => (
                    <button
                      key={entry.name}
                      className="tree-row"
                      style={styles.dirItem}
                      onClick={() => entry.isDirectory && navigateTo(entry.name)}
                      disabled={!entry.isDirectory}
                    >
                      <span style={styles.dirArrow}>
                        {entry.isDirectory ? "▸" : " "}
                      </span>
                      <span style={{
                        ...styles.dirItemName,
                        color: entry.isDirectory ? "var(--text-primary)" : "var(--text-muted)",
                      }}>
                        {entry.name}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>

            <div style={styles.footer}>
              <button onClick={handleSelect} className="btn-primary" style={styles.selectBtn}>
                Open {currentPath.split("/").pop() || "/"}
              </button>
            </div>
          </>
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
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
  },
  sshLabel: {
    fontSize: 12,
    color: "var(--cyan)",
    fontFamily: "var(--font-mono)",
  },
  closeBtn: {
    padding: "5px 12px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    fontSize: 12,
  },
  backBtn: {
    padding: "5px 12px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    fontSize: 12,
  },
  body: {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    padding: "8px 10px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    outline: "none",
  },
  error: {
    color: "var(--red)",
    fontSize: 12,
    padding: "2px 0",
  },
  connectBtn: {
    padding: "8px 18px",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: "#0a0c10",
    fontWeight: 600,
    fontSize: 13,
    alignSelf: "flex-start",
  },
  recentSection: {
    marginTop: 4,
    borderTop: "1px solid var(--border-subtle)",
    paddingTop: 12,
  },
  recentTitle: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontWeight: 600,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  recentItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "6px 10px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    textAlign: "left",
  },
  recentHost: {
    color: "var(--cyan)",
  },
  recentPort: {
    color: "var(--text-muted)",
    fontSize: 11,
  },
  pathBar: {
    padding: "6px 14px",
    background: "var(--bg-primary)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  pathLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--accent)",
  },
  dirList: {
    flex: 1,
    overflowY: "auto",
    minHeight: 200,
    maxHeight: 400,
  },
  loadingText: {
    padding: 20,
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 12,
  },
  dirItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "5px 14px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    textAlign: "left",
  },
  dirArrow: {
    fontSize: 10,
    color: "var(--text-muted)",
    width: 12,
    flexShrink: 0,
  },
  dirItemName: {
    flex: 1,
  },
  footer: {
    padding: "12px 16px",
    borderTop: "1px solid var(--border-subtle)",
    display: "flex",
    justifyContent: "flex-end",
  },
  selectBtn: {
    padding: "8px 20px",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: "#0a0c10",
    fontWeight: 600,
    fontSize: 13,
  },
};
