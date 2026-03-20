import { useEffect } from "react";

interface Props {
  onClose: () => void;
}

const shortcuts = [
  { keys: "Cmd+Shift+P", action: "Command palette" },
  { keys: "Cmd+1-9", action: "Switch to agent by position" },
  { keys: "Cmd+W", action: "Close selected agent" },
  { keys: "Cmd+-", action: "Toggle split terminal" },
  { keys: "Cmd+Up", action: "Focus agent terminal" },
  { keys: "Cmd+Down", action: "Focus split terminal" },
  { keys: "Shift+Enter", action: "New line in input" },
  { keys: "Cmd+?", action: "Show shortcuts" },
];

export function ShortcutsModal({ onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey, { capture: true });
    return () => window.removeEventListener("keydown", handleKey, { capture: true });
  }, [onClose]);

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Keyboard Shortcuts</h3>
        </div>
        <div style={styles.list}>
          {shortcuts.map((s) => (
            <div key={s.keys} style={styles.row}>
              <span style={styles.keys}>{s.keys}</span>
              <span style={styles.action}>{s.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.4)",
    display: "flex",
    justifyContent: "center",
    paddingTop: 80,
    zIndex: 200,
  },
  modal: {
    width: 400,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
    alignSelf: "flex-start",
  },
  header: {
    padding: "14px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
  },
  list: {
    padding: "8px 0",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 16px",
  },
  keys: {
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    color: "var(--text-muted)",
    background: "var(--bg-primary)",
    padding: "2px 6px",
    borderRadius: 3,
  },
  action: {
    fontSize: 13,
    color: "var(--text-primary)",
  },
};
