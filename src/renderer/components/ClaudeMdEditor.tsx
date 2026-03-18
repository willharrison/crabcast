import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  cwd: string;
  onClose: () => void;
}

export function ClaudeMdEditor({ cwd, onClose }: Props) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePath = `${cwd}/CLAUDE.md`;

  useEffect(() => {
    window.electronAPI.readFile(filePath).then((text) => {
      setContent(text ?? "");
      setLoaded(true);
    });
  }, [filePath]);

  const save = useCallback(
    async (text: string) => {
      await window.electronAPI.writeFile(filePath, text);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    },
    [filePath]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);

    // Debounced auto-save (1s after last keystroke)
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(text), 1000);
  };

  // Save on close / unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClose = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await save(content);
    onClose();
  };

  // Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content]);

  if (!loaded) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <h3 style={styles.title}>CLAUDE.md</h3>
            <span style={styles.path}>{filePath}</span>
          </div>
          <div style={styles.headerRight}>
            {savedNotice && <span style={styles.saved}>Saved</span>}
            <button onClick={handleClose} className="btn-ghost" style={styles.closeBtn}>
              Close
            </button>
          </div>
        </div>
        <textarea
          style={styles.editor}
          value={content}
          onChange={handleChange}
          spellCheck={false}
          autoFocus
        />
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
    maxWidth: 720,
    height: "70%",
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
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    flexShrink: 0,
  },
  path: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  saved: {
    fontSize: 11,
    color: "var(--green)",
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
  editor: {
    flex: 1,
    padding: 16,
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: 1.6,
    border: "none",
    outline: "none",
    resize: "none",
  },
};
