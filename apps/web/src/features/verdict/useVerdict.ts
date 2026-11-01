"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { IdentityResult, type Locale } from "@nether/contracts";
import type { VoiceView } from "../voice/client";

// HTTP recovery is scoped to the ended encounter, independently of the live WS path.
export function useVerdict(view: VoiceView, setView: Dispatch<SetStateAction<VoiceView>>, locale: Locale) {
  const [generatingVerdict, setGeneratingVerdict] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const resetVerdict = useCallback(() => {
    request.current?.abort(); request.current = null;
    setGeneratingVerdict(false); setVerdictError(null);
  }, []);
  useEffect(() => () => request.current?.abort(), []);
  const claimVerdict = useCallback(async () => {
    const draft = view.draft;
    if (!draft || request.current || view.result || view.phase !== "ended") return;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    setGeneratingVerdict(true); setVerdictError(null);
    try {
      const response = await fetch("/api/verdict", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: draft.sessionId, turns: draft.turns }) });
      const data = await response.json();
      if (controller.signal.aborted) return;
      const result = IdentityResult.safeParse(data.result);
      if (!response.ok || !result.success || result.data.sessionId !== draft.sessionId || result.data.characterId !== draft.characterId) throw new Error(data.error === "NO_STORY" ? "NO_STORY" : "RESULT_FAILED");
      setView(current => current.session?.id === draft.sessionId && current.phase === "ended" && !current.result ? { ...current, result: result.data } : current);
      try { sessionStorage.setItem(`nc_result_${draft.sessionId}`, JSON.stringify(result.data)); } catch {}
    } catch (error) {
      if (request.current === controller) setVerdictError(error instanceof Error && error.message === "NO_STORY" ? (locale === "zh" ? "还没有收到足够的故事细节。" : "Not enough story details yet.") : (locale === "zh" ? "身份生成暂不可用，请重试。" : "Identity generation is unavailable. Please retry."));
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setGeneratingVerdict(false); }
    }
  }, [view.draft, view.phase, view.result, setView, locale]);
  useEffect(() => {
    if (view.phase !== "ended" || !view.draft || view.result || verdictError) return;
    const timer = setTimeout(() => { void claimVerdict(); }, 50);
    return () => clearTimeout(timer);
  }, [view.phase, view.draft, view.result, verdictError, claimVerdict]);
  return { generatingVerdict, verdictError, claimVerdict, resetVerdict };
}
