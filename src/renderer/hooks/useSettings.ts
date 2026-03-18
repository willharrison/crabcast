import { useState, useEffect, useCallback } from "react";
import type { AppSettings } from "../../shared/types.js";
import { DEFAULT_SETTINGS } from "../../shared/types.js";

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettingsState);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettingsState(next);
    await window.electronAPI.setSettings(next);
  }, [settings]);

  return { settings, updateSettings };
}
