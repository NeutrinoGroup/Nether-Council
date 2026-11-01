"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { useReducedMotion } from "framer-motion";
import type { CharacterId, Locale } from "@nether/contracts";
import { getCharacter } from "@nether/party-core";
import type { VoiceClient, VoiceView } from "./client";
import type { AudioLevels } from "./useAudioReactive";
import { SoupAltar } from "./SoupAltar";
import { TheatreCaptions } from "./TheatreCaptions";
import { LettingGoRitual } from "../ritual/LettingGoRitual";
import { errorText, words } from "./words";
import { VoiceTextInput } from "./VoiceTextInput";
import { InAppBrowserBanner } from "./InAppBrowserBanner";

export function ImmersiveEncounter({ view, locale, invite, characterId, client, audio, start, hydrated, generatingVerdict, verdictError, claimVerdict, onClose }: {
  view: VoiceView; locale: Locale; invite: string; characterId: CharacterId; client: MutableRefObject<VoiceClient | null>;
  audio: MutableRefObject<AudioLevels>; start: () => void; hydrated: boolean;
  generatingVerdict: boolean; verdictError: string | null; claimVerdict: () => void; onClose: () => void;
}) {
  const reduced = Boolean(useReducedMotion()), heading = useRef<HTMLHeadingElement>(null);
  const active = !["idle", "ended", "error"].includes(view.phase);
  const t = words[locale], meta = getCharacter(view.session?.characterId ?? characterId);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <section className="immersive-encounter" data-demo-reason={view.demoReason} onKeyDown={event => { if (event.key === "Escape") onClose(); }} aria-labelledby="encounter-title">
    <div className="encounter-topline"><h2 ref={heading} tabIndex={-1} id="encounter-title">{meta.name[locale]}<span>{locale === "zh" ? "今夜，听你说。" : "Your story, tonight."}</span></h2><button onClick={onClose}>{locale === "zh" ? "返回人间" : "Back to the living"}<span aria-hidden="true"> ↗</span></button></div>
    <div className="immersive-dialogue">
      {!active && view.phase !== "ended" && <p className="encounter-welcome">{meta.intro[locale]}</p>}
      {view.scene?.worry && <p className="ritual-worry" role="status">{view.scene.worry}</p>}
      {view.scene?.blessing && <p className="ritual-blessing" role="status">{view.scene.blessing}</p>}
      <TheatreCaptions caption={view.caption} userCaption={view.userCaption} locale={locale} reduced={reduced} />
      {view.result ? <LettingGoRitual key={view.result.id} result={view.result} draft={view.draft} locale={locale} invite={invite} reduced={reduced} /> : <>
        <SoupAltar audio={audio} reduced={reduced} />
        <p className="soup-description">{locale === "zh" ? "把烦恼说出来，注入这一碗。" : "Pour your story into the brew."}</p>
      </>}
      <div className="encounter-glass">
        <InAppBrowserBanner locale={locale} />
        <VoiceTextInput view={view} locale={locale} client={client} />
        <p role="status">{view.finalizing || generatingVerdict ? (locale === "zh" ? "正在为你写下解忧签…" : "Writing your blessing…") : t.states[view.phase]}</p>
        {!invite && <p className="invite-note">{t.invite}</p>}
        {view.error && <p role="alert">{errorText(view.error, locale)}</p>}
        {verdictError && <p role="alert">{verdictError}<button onClick={claimVerdict}>{locale === "zh" ? "重试解忧签" : "Retry blessing"}</button></p>}
        {!active ? <>
          {view.phase === "ended" && !view.draft && <p>{locale === "zh" ? "还没收好一个故事，再说一句最近的离谱事吧。" : "No story collected yet. Try a little more detail."}</p>}
          <button className="encounter-mic" disabled={!invite || !hydrated} onClick={start}>{locale === "zh" ? `开麦，向${meta.name.zh}倾诉` : "Turn on mic & talk"}</button>
          <p className="mic-permission">{t.mic}</p>
        </> : <div className="immersive-controls">
          <button onClick={() => client.current?.mute(!view.muted)} disabled={view.finalizing || view.demo} aria-pressed={view.muted}>{view.muted ? t.unmute : t.mute}</button>
          <button onClick={() => client.current?.interrupt()} disabled={view.phase !== "speaking"}>{locale === "zh" ? "让我说一句" : "Let me speak"}</button>
          {view.canClaim && <button disabled={view.finalizing} onClick={() => client.current?.finish()}>{locale === "zh" ? "请孟婆下解忧判词" : "Ask for my blessing"}</button>}
          <button onClick={() => client.current?.stop()}>{t.stop}</button>
        </div>}

      </div>
    </div>
  </section>;
}
