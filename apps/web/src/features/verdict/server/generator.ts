import { randomUUID } from "node:crypto";
import { type ConfirmedTurn, IdentityResult, ResultContent, type Session, validateResultSources } from "@nether/contracts";
import { isStoryText } from "@nether/party-core";
import { completeJson, type TextConfig } from "../../../shared/server/text";

const SYSTEM_PROMPT = `You are Meng Po (孟婆), the afterlife bartender at Nether Council (黄泉议会).
Based on the confirmed user story turns, create a personalized afterlife Halloween identity result.
Constraints:
- You must generate both Chinese and English fields for title, verdict, warmClosing, and 2-3 tags.
- title: Character-conferred afterlife title/persona reflecting their story (zh <= 18 chars, en <= 64 chars). Example: "黄泉夜巡客" / "Night Patrol Wanderer".
- verdict: A witty, gentle comment directly referencing a concrete detail they told you (zh <= 60 chars, en <= 180 chars). Do NOT include full quotes or real private names.
- warmClosing: A brief, warm comforting closing line (zh <= 50 chars, en <= 160 chars).
- tags: 2 to 3 characteristic tags (each tag: zh <= 10 chars, en <= 28 chars).
- sourceTurnIds: Array of 1 to 8 turn IDs from the provided user story turns that informed this verdict.
- Output ONLY a JSON object matching this schema:
{
  "title": { "zh": "...", "en": "..." },
  "verdict": { "zh": "...", "en": "..." },
  "warmClosing": { "zh": "...", "en": "..." },
  "tags": [ { "zh": "...", "en": "..." }, { "zh": "...", "en": "..." } ],
  "sourceTurnIds": ["..."]
}`;

export function createFallbackIdentity(session: Session, sourceTurnId: string): IdentityResult {
  return IdentityResult.parse({
    id: randomUUID(),
    sessionId: session.id,
    characterId: session.characterId,
    generatedAt: Date.now(),
    fallback: true,
    title: { zh: "黄泉夜巡客", en: "Night Patrol Guest" },
    verdict: {
      zh: "今晚在忘忧汤前留下了一段心事，烦恼已随南瓜汤消散在冥界夜风里。",
      en: "Left a burden by the soup kettle tonight; your worries drift away in the afterlife breeze.",
    },
    warmClosing: {
      zh: "喝完这碗汤，明天又是新的人间。常来坐坐。",
      en: "Finish this cup, and face tomorrow anew. Come back whenever you need.",
    },
    tags: [
      { zh: "夜巡客", en: "Night Wanderer" },
      { zh: "忘忧人", en: "Worry Free" },
    ],
    sourceTurnIds: [sourceTurnId],
  });
}

export async function generateIdentity(
  session: Session,
  turns: ConfirmedTurn[],
  config: TextConfig,
  signal?: AbortSignal
): Promise<IdentityResult> {
  const storyTurns = turns.filter(t => t.speaker === "user" && isStoryText(t.text));
  if (storyTurns.length === 0) {
    const error = new Error("NO_STORY");
    error.name = "NO_STORY";
    throw error;
  }

  const knownTurnIds = new Set(storyTurns.map(t => t.id));
  const payload = {
    turns: storyTurns.map(t => ({ id: t.id, text: t.text })),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error("GENERATION_ABORTED");
    const deadline = new AbortController();
    const timeout = setTimeout(() => deadline.abort(), 4500);
    const activeSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    try {
      const raw = await completeJson(config, SYSTEM_PROMPT, payload, activeSignal);
      const parsed = ResultContent.parse(raw);
      if (validateResultSources(parsed, knownTurnIds)) {
        return IdentityResult.parse({
          ...parsed,
          id: randomUUID(),
          sessionId: session.id,
          characterId: session.characterId,
          generatedAt: Date.now(),
          fallback: false,
        });
      }
    } catch {
      // Retry once bounded
    } finally {
      clearTimeout(timeout);
    }
  }

  // Fallback if model generation repeatedly failed
  return createFallbackIdentity(session, storyTurns[0].id);
}
