import { useState, useEffect, useRef, useCallback } from "react";
import type { AppSettings, AgentInfo } from "../../shared/types.js";

interface Command {
  id: string;
  label: string;
  description?: string;
  action: () => void;
}

interface Props {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onOpenDirectory: () => void;
  onResume: () => void;
  onSSH: () => void;
  onClose: () => void;
  selectedAgent: AgentInfo | null;
  onRenameAgent: (id: string, name: string) => void;
  onResetAgentName: (id: string) => void;
}

type Mode = "commands" | "input";

export function CommandPalette({ settings, onUpdateSettings, onOpenDirectory, onResume, onSSH, onClose, selectedAgent, onRenameAgent, onResetAgentName }: Props) {
  const [filter, setFilter] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("commands");
  const [inputLabel, setInputLabel] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [inputHandler, setInputHandler] = useState<((val: string) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: Command[] = [
    {
      id: "open-directory",
      label: "Agent: Open Directory",
      action: () => { onClose(); onOpenDirectory(); },
    },
    {
      id: "resume-session",
      label: "Agent: Resume Session",
      action: () => { onClose(); onResume(); },
    },
    {
      id: "ssh-remote",
      label: "Agent: SSH Remote",
      action: () => { onClose(); onSSH(); },
    },
    {
      id: "terminal-font-size",
      label: "Terminal: Font Size",
      description: `Current: ${settings.terminalFontSize}px`,
      action: () => {
        setMode("input");
        setInputLabel("Terminal Font Size");
        setInputValue(String(settings.terminalFontSize));
        setFilter("");
        setInputHandler(() => (val: string) => {
          const size = parseInt(val, 10);
          if (size >= 8 && size <= 32) {
            onUpdateSettings({ terminalFontSize: size });
          }
          onClose();
        });
      },
    },
    {
      id: "toggle-notifications",
      label: "Toggle Notifications",
      description: settings.notifications ? "On" : "Off",
      action: () => {
        onUpdateSettings({ notifications: !settings.notifications });
        onClose();
      },
    },
    ...(selectedAgent ? [
      {
        id: "rename-agent",
        label: "Agent: Rename",
        description: selectedAgent.customName ?? selectedAgent.repoName,
        action: () => {
          setMode("input");
          setInputLabel("Rename Agent");
          setInputValue(selectedAgent.customName ?? selectedAgent.repoName);
          setFilter("");
          setInputHandler(() => (val: string) => {
            const trimmed = val.trim();
            if (trimmed) {
              onRenameAgent(selectedAgent.id, trimmed);
            }
            onClose();
          });
        },
      },
      {
        id: "reset-agent-name",
        label: "Agent: Reset Name",
        description: `Revert to "${selectedAgent.repoName}"`,
        action: () => {
          onResetAgentName(selectedAgent.id);
          onClose();
        },
      },
    ] : []),
  ];

  const filtered = filter
    ? commands.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase()))
    : commands;

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "input") {
          setMode("commands");
          setFilter("");
        } else {
          onClose();
        }
        return;
      }

      if (mode === "input") {
        if (e.key === "Enter" && inputHandler) {
          inputHandler(inputValue);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[selectedIndex]?.action();
      }
    },
    [mode, filtered, selectedIndex, inputHandler, inputValue, onClose]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  return (
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        {mode === "commands" ? (
          <>
            <input
              ref={inputRef}
              style={styles.input}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              autoFocus
            />
            <div ref={listRef} style={styles.list}>
              {filtered.length === 0 ? (
                <div style={styles.empty}>No matching commands</div>
              ) : (
                filtered.map((cmd, i) => (
                  <div
                    key={cmd.id}
                    className="palette-item"
                    style={{
                      ...styles.item,
                      background:
                        i === selectedIndex ? "var(--bg-highlight)" : "transparent",
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onClick={() => cmd.action()}
                  >
                    <span style={styles.itemLabel}>{cmd.label}</span>
                    {cmd.description && (
                      <span style={styles.itemDesc}>{cmd.description}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div style={styles.inputHeader}>{inputLabel}</div>
            <input
              ref={inputRef}
              style={styles.input}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
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
    background: "rgba(0, 0, 0, 0.4)",
    display: "flex",
    justifyContent: "center",
    paddingTop: 80,
    zIndex: 200,
  },
  modal: {
    width: 460,
    maxHeight: 340,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
    display: "flex",
    flexDirection: "column",
    alignSelf: "flex-start",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "var(--font-sans)",
    outline: "none",
  },
  inputHeader: {
    padding: "10px 16px 0",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
  },
  list: {
    flex: 1,
    overflowY: "auto",
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    cursor: "pointer",
  },
  itemLabel: {
    fontSize: 13,
    color: "var(--text-primary)",
  },
  itemDesc: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  },
  empty: {
    padding: 16,
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 12,
  },
};
