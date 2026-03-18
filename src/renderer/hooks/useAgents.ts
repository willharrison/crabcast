import { useState, useEffect, useCallback } from "react";
import type { AgentInfo, CreateAgentOpts } from "../../shared/types.js";

export function useAgents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    window.electronAPI.listAgents().then(setAgents);

    const unsub = window.electronAPI.onAgentStateChanged((updated) => {
      setAgents((prev) => {
        const idx = prev.findIndex((a) => a.id === updated.id);
        if (idx === -1) return [...prev, updated];
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
    });

    return unsub;
  }, []);

  const createAgent = useCallback(
    async (opts: CreateAgentOpts) => {
      const info = await window.electronAPI.createAgent(opts);
      setAgents((prev) => [...prev, info]);
      return info;
    },
    []
  );

  const stopAgent = useCallback(async (id: string) => {
    await window.electronAPI.stopAgent(id);
  }, []);

  const removeAgent = useCallback(async (id: string) => {
    await window.electronAPI.removeAgent(id);
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const patchAgent = useCallback((id: string, patch: Partial<AgentInfo>) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  }, []);

  const reorderAgents = useCallback((fromIndex: number, toIndex: number) => {
    setAgents((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  return { agents, createAgent, stopAgent, removeAgent, patchAgent, reorderAgents };
}
