import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import type { AgentInfo, AppSettings, WindowState } from "../shared/types.js";
import { DEFAULT_SETTINGS } from "../shared/types.js";

const STORE_PATH = path.join(app.getPath("userData"), "agent-state.json");
const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");
const WINDOW_STATE_PATH = path.join(app.getPath("userData"), "window-state.json");

interface StoreData {
  agents: AgentInfo[];
}

export function loadState(): AgentInfo[] {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const data: StoreData = JSON.parse(raw);
    // Reset any running/error agents to idle on restore
    return data.agents.map((a) => ({
      ...a,
      state: "idle" as const,
    }));
  } catch {
    return [];
  }
}

export function saveState(agents: AgentInfo[]): void {
  const data: StoreData = { agents };
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch {
    // Silent fail — non-critical
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch {
    // Silent fail
  }
}

export function loadWindowState(): WindowState | null {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveWindowState(state: WindowState): void {
  try {
    fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state, null, 2));
  } catch {
    // Silent fail
  }
}
