# CrabCast

A desktop app for managing multiple Claude Code CLI instances. TypeScript backend, React frontend.

## Stack
- Language: TypeScript
- Frontend: React
- Terminals: xterm.js + node-pty
- Framework: Electron + Vite
- Purpose: Manage multiple Claude Code sessions across different repos

## Key Features
- Spawn Claude CLI sessions against specific directories/repos
- Track agent state (cwd, git status, branch, activity detection)
- Monitor and manage multiple concurrent agent instances
- Session persistence and resume (including external sessions)
- SSH remote agents
- Command palette for settings and actions
