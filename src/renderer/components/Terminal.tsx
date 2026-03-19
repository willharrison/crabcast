import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "xterm/css/xterm.css";
import type { AgentId, SSHConnection } from "../../shared/types.js";

interface Props {
  agentId: AgentId;
  cwd: string;
  ssh?: SSHConnection;
  sessionId?: string;
  fontSize?: number;
  visible: boolean;
}

const TERM_THEME = {
  background: "#0e1117",
  foreground: "#eceff4",
  cursor: "#58a6ff",
  cursorAccent: "#0e1117",
  selectionBackground: "#252a33",
  selectionForeground: "#eceff4",
  black: "#0a0c10",
  red: "#f47067",
  green: "#56d364",
  yellow: "#e3b341",
  blue: "#58a6ff",
  magenta: "#d2a8ff",
  cyan: "#56d4dd",
  white: "#c1c7d0",
  brightBlack: "#6b7280",
  brightRed: "#f47067",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#58a6ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#eceff4",
};

// Keep xterm instances alive across agent switches so we don't lose scrollback
const terminalCache = new Map<string, {
  term: XTerm;
  fit: FitAddon;
  spawned: boolean;
  opened: boolean;
}>();

export function Terminal({ agentId, cwd, ssh, sessionId, fontSize = 13, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Initialize terminal and PTY once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let entry = terminalCache.get(agentId);
    if (!entry) {
      const term = new XTerm({
        cursorBlink: true,
        fontSize,
        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
        lineHeight: 1.35,
        letterSpacing: 0,
        scrollback: 5000,
        theme: TERM_THEME,
        allowProposedApi: true,
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());

      // Intercept Shift+Enter to send a newline for multi-line input.
      // xterm.js sends \r for both Enter and Shift+Enter by default.
      // Claude CLI treats \n as a line continuation within the input.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type === "keydown" && e.key === "Enter" && e.shiftKey) {
          window.electronAPI.ptyWrite(agentId, "\n");
          return false;
        }
        return true;
      });

      entry = { term, fit, spawned: false, opened: false };
      terminalCache.set(agentId, entry);
    }

    const { term, fit } = entry;

    // Wire up data and resize to PTY
    const dataDisposable = term.onData((data) => {
      window.electronAPI.ptyWrite(agentId, data);
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.electronAPI.ptyResize(agentId, cols, rows);
    });

    // Listen for PTY output — just write, no scroll manipulation.
    // xterm 5.4.0-beta.37 fixes the alt buffer scroll teleport natively.
    const removePtyData = window.electronAPI.onPtyData(({ agentId: id, data }) => {
      if (id === agentId) {
        term.write(data);
      }
    });

    const removePtyExit = window.electronAPI.onPtyExit(({ agentId: id, exitCode }) => {
      if (id === agentId) {
        term.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
      }
    });

    // Listen for session ID detection and persist it
    const removePtySessionId = window.electronAPI.onPtySessionId(({ agentId: id, sessionId: sid }) => {
      if (id === agentId) {
        window.electronAPI.updateAgentSession(agentId, sid);
      }
    });

    // Spawn PTY immediately so the agent starts working in the background
    if (!entry.spawned) {
      entry.spawned = true;
      window.electronAPI.ptySpawn(agentId, cwd, ssh, sessionId);
    }

    // Fit on window resize only — not on content changes.
    // Using window resize event instead of ResizeObserver to avoid
    // scroll-to-top issues caused by fit() firing during output flow.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleWindowResize = () => {
      if (!visibleRef.current) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => fit.fit(), 100);
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      removePtyData();
      removePtyExit();
      removePtySessionId();
      window.removeEventListener("resize", handleWindowResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
    // Only run on mount — terminal stays alive for the lifetime of the agent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // When becoming visible: open terminal into DOM on first show, refit on all shows
  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    const entry = terminalCache.get(agentId);
    if (!entry || !container) return;

    // First time visible — open xterm into the container now that it has layout
    if (!entry.opened) {
      entry.opened = true;
      entry.term.open(container);

      // Override scrollIntoView on xterm's hidden textarea.
      // The browser calls this on focus/input which scrolls parent containers.
      const textarea = container.querySelector(".xterm-helper-textarea");
      if (textarea) {
        (textarea as any).scrollIntoView = () => {};
      }

    }

    requestAnimationFrame(() => {
      entry.fit.fit();
      const dims = entry.fit.proposeDimensions();
      if (dims) {
        window.electronAPI.ptyResize(agentId, dims.cols, dims.rows);
      }
      entry.term.focus();
    });
  }, [visible, agentId]);

  // Update font size on all cached terminals when setting changes
  useEffect(() => {
    for (const [, cached] of terminalCache) {
      if (cached.term.options.fontSize !== fontSize) {
        cached.term.options.fontSize = fontSize;
        cached.fit.fit();
      }
    }
  }, [fontSize]);

  return (
    <div style={{
      ...styles.outer,
      display: visible ? undefined : "none",
      background: "#0e1117",
    }}>
      <div
        ref={containerRef}
        style={styles.container}
      />
    </div>
  );
}

/** Clean up a terminal when an agent is removed */
export function destroyTerminal(agentId: string): void {
  const entry = terminalCache.get(agentId);
  if (entry) {
    entry.term.dispose();
    terminalCache.delete(agentId);
  }
  window.electronAPI.ptyKill(agentId);
}

const styles: Record<string, React.CSSProperties> = {
  outer: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    background: "#0e1117",
    padding: "8px 0 0 8px",
  },
  container: {
    width: "100%",
    height: "100%",
  },
};
