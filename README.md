# CrabCast

A desktop app for managing multiple [Claude Code](https://claude.ai/code) CLI instances simultaneously. Run Claude agents across different repos, monitor their activity, and manage permissions — all from a single window.

> *A cast is a group of crabs.*

![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)

## Features

- **Multi-agent management** — spawn Claude Code sessions against different directories and switch between them instantly
- **Embedded terminals** — full xterm.js terminals with PTY backend, identical to running Claude in your regular terminal
- **Activity detection** — see which agents are thinking, idle, or waiting for permission approval
- **Session persistence** — agents and their sessions survive app restarts via `claude --resume`
- **Resume external sessions** — pick up Claude sessions that were started outside the orchestrator
- **SSH remote agents** — run Claude on remote machines over SSH
- **Git integration** — sidebar shows branch, modified/added/deleted/untracked file counts per agent
- **Git status panel** — full git status view with recent log
- **File explorer panel** — browse the working directory of any agent
- **Command palette** — `Cmd+Shift+P` for quick access to all commands and settings
- **System notifications** — get notified when an agent needs attention (permission prompts, completion)
- **Drag-and-drop reorder** — organize agents by dragging them in the sidebar
- **File drag-and-drop** — drop files onto a terminal to paste their path
- **CLAUDE.md editor** — edit the CLAUDE.md file for any agent's directory
- **Custom agent names** — rename agents via the command palette
- **Window state persistence** — remembers window size and position

## Prerequisites

- [Claude Code CLI](https://claude.ai/code) installed and authenticated (`claude` available in your PATH)
- Node.js 18+
- macOS (primary target; may work on Linux/Windows with adjustments)

## Install

```bash
git clone https://github.com/willharrison/crabcast.git
cd crabcast
npm install
```

## Development

```bash
npm start
```

This starts the Electron app with Vite hot reload.

## Build

```bash
npm run package    # Package the app
npm run make       # Create distributable
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+P` | Command palette |
| `Cmd+1-9` | Switch to agent by position |
| `Cmd+W` | Close selected agent |
| `Cmd+G` | Toggle git panel |
| `Cmd+F` | Toggle files panel |
| `Esc` | Close panel / dismiss |

## Command Palette Commands

- **Agent: Open Directory** — add a new agent from a local directory
- **Agent: Resume Session** — resume a Claude session from `~/.claude/projects/`
- **Agent: SSH Remote** — connect to a remote machine
- **Agent: Rename** — give the selected agent a custom name
- **Agent: Reset Name** — revert to directory-based name
- **Terminal: Font Size** — change the terminal font size (8-32px)
- **Toggle Notifications** — enable/disable system notifications

## Architecture

```
src/
  main/           # Electron main process
    index.ts        # App entry, window creation, menu
    agent-manager.ts # Agent lifecycle, persistence
    pty-manager.ts   # node-pty terminal backend
    ipc-handlers.ts  # IPC bridge between main and renderer
    git-service.ts   # Git operations (local)
    ssh-service.ts   # SSH connection management
    store.ts         # JSON file persistence
  preload/        # Electron preload (context bridge)
  renderer/       # React frontend
    App.tsx          # Root layout, keyboard shortcuts, activity tracking
    components/
      AgentList.tsx       # Sidebar agent list with status indicators
      AgentDetail.tsx     # Header + terminal container
      Terminal.tsx        # xterm.js terminal with PTY integration
      GitStatus.tsx       # Git panel
      DirectoryExplorer.tsx # File browser panel
      CommandPalette.tsx  # Command palette modal
      ResumeSessionModal.tsx # Session picker
      SSHConnectModal.tsx # SSH connection form
      AddAgentMenu.tsx    # New agent dropdown
      ClaudeMdEditor.tsx  # CLAUDE.md file editor
    hooks/
      useAgents.ts    # Agent state management
      useSettings.ts  # App settings (font size, notifications)
  shared/
    types.ts        # Shared types, IPC channels, ElectronAPI interface
```

## How It Works

Each agent is a real Claude Code CLI process running in a pseudo-terminal (PTY). The app uses `node-pty` to spawn these processes and `xterm.js` to render them. This means you get the exact same experience as running Claude in your terminal — all features, slash commands, and interactive prompts work.

Agent activity is detected by watching the PTY output for Claude's thinking animation characters. Permission prompts are detected by pattern-matching the rendered terminal output for Claude's interactive Yes/No menu.

Sessions are persisted by capturing the session ID from Claude's output (`--resume <id>`) and storing it with the agent state. On restart, agents are respawned with the resume flag.

## License

MIT
