"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface CopilotJob { id: string; title: string; company: string }
interface CopilotState {
  enabled: boolean;
  isOpen: boolean;
  job: CopilotJob | null;
  open: (job?: CopilotJob | null, prompt?: string) => void;
  close: () => void;
  setJob: (job: CopilotJob | null) => void;
  pendingPrompt: string | null;
  consumePrompt: () => string | null;
}
const Ctx = createContext<CopilotState | null>(null);

export function CopilotProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [job, setJobState] = useState<CopilotJob | null>(null);
  const [pendingPrompt, setPending] = useState<string | null>(null);
  const open = useCallback((j?: CopilotJob | null, prompt?: string) => { if (j !== undefined) setJobState(j); if (prompt) setPending(prompt); setOpen(true); }, []);
  const close = useCallback(() => setOpen(false), []);
  const setJob = useCallback((j: CopilotJob | null) => setJobState(j), []);
  const consumePrompt = useCallback(() => { const p = pendingPrompt; setPending(null); return p; }, [pendingPrompt]);
  const value = useMemo(() => ({ enabled, isOpen, job, open, close, setJob, pendingPrompt, consumePrompt }), [enabled, isOpen, job, open, close, setJob, pendingPrompt, consumePrompt]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCopilot(): CopilotState {
  const v = useContext(Ctx);
  if (!v) return { enabled: false, isOpen: false, job: null, open: () => {}, close: () => {}, setJob: () => {}, pendingPrompt: null, consumePrompt: () => null };
  return v;
}
