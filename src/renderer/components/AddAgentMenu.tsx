import { useEffect, useRef } from "react";

interface Props {
  onOpenDirectory: () => void;
  onResume: () => void;
  onSSH: () => void;
  onClose: () => void;
}

export function AddAgentMenu({ onOpenDirectory, onResume, onSSH, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} style={styles.menu}>
      <button
        className="sidebar-item"
        style={styles.item}
        onClick={() => { onOpenDirectory(); onClose(); }}
      >
        Open Directory
      </button>
      <button
        className="sidebar-item"
        style={styles.item}
        onClick={() => { onResume(); onClose(); }}
      >
        Resume Session
      </button>
      <button
        className="sidebar-item"
        style={styles.item}
        onClick={() => { onSSH(); onClose(); }}
      >
        SSH Remote
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: "absolute",
    top: 44,
    right: 10,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
    zIndex: 50,
    overflow: "hidden",
    minWidth: 160,
  },
  item: {
    display: "block",
    width: "100%",
    padding: "8px 14px",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    fontSize: 12,
    textAlign: "left",
    cursor: "pointer",
  },
};
