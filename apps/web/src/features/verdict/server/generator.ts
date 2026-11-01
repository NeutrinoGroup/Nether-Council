import { randomUUID } from "node:crypto";
import { type CharacterId, type ConfirmedTurn, IdentityResult, ResultContent, type Session, validateResultSources } from "@nether/contracts";
import { getCharacter, isStoryText } from "@nether/party-core";
import { completeJson, type TextConfig } from "../../../shared/server/text";

export function characterSystemPrompt(characterId: CharacterId): string {
  const meta = getCharacter(characterId);
  return `You are ${meta.name.zh} / ${meta.name.en} (${meta.role.zh}) at Nether Council (黄泉议会).
Persona goal: ${meta.closingDirection.zh} / ${meta.closingDirection.en}.
Based on the confirmed user story turns, create a personalized afterlife Halloween identity result.
Constraints:
- You must generate both Chinese and English fields for title, verdict, warmClosing, and 2-3 tags.
- title: Character-conferred afterlife title/persona reflecting their story and your persona (zh <= 18 chars, en <= 64 chars).
- verdict: A witty, gentle comment directly referencing a concrete detail they told you (zh <= 60 chars, en <= 180 chars). Do NOT include full quotes or real private names.
- warmClosing: A brief, warm comforting closing line in your character's unique voice (zh <= 50 chars, en <= 160 chars).
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
}

const FALLBACK_MAP: Record<CharacterId, {
  title: { zh: string; en: string };
  verdict: { zh: string; en: string };
  warmClosing: { zh: string; en: string };
  tags: { zh: string; en: string }[];
}> = {
  "meng-po": {
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
  },
  "hei-wuchang": {
    title: { zh: "冥界终身荣誉巡查", en: "Honorary Nether Inspector" },
    verdict: {
      zh: "阳间加班熬夜的硬扛精神令本官叹服，特批冥界终身职位，免一切早八打卡。",
      en: "Your mortal grit and overtime endurance impressed the court. Granted honorary tenure exempt from early shifts.",
    },
    warmClosing: {
      zh: "本官准你今夜无梦安睡，天下太平，退堂。",
      en: "The court permits you a peaceful, dreamless sleep. Peace under heaven.",
    },
    tags: [
      { zh: "免打卡", en: "No Clock-In" },
      { zh: "硬扛官", en: "Grit Master" },
    ],
  },
  "bai-wuchang": {
    title: { zh: "冥府特聘相声宗师", en: "Afterlife Certified Comedy Icon" },
    verdict: {
      zh: "哈哈哈哈！那些社死乌龙不过是你留在人间的精彩段子，值得满堂喝彩！",
      en: "Those cringe moments are merely legendary comedy gold you gifted the mortal world!",
    },
    warmClosing: {
      zh: "一见生财！带着笑意睡个好觉，明天继续把生活过成段子！",
      en: "Wealth at first sight! Sleep with a smile and turn tomorrow into your stage!",
    },
    tags: [
      { zh: "段子手", en: "Comedy Star" },
      { zh: "生财客", en: "Fortune Seeker" },
    ],
  },
  "zhong-kui": {
    title: { zh: "伏魔殿特许通行勇者", en: "Demon-Slayer Hall Champion" },
    verdict: {
      zh: "缠扰你的焦虑小鬼已被本天师一剑荡平，此后浩气长存，百邪不侵！",
      en: "The petty anxieties haunting you were banished by my sword. Walk fearlessly henceforth!",
    },
    warmClosing: {
      zh: "浩气冲天，安行阳世！今夜有本天师在此镇守，高枕无忧。",
      en: "Rest easy tonight. With Zhong Kui guarding your sleep, no phantom dares approach.",
    },
    tags: [
      { zh: "斩烦恼", en: "Demon Bane" },
      { zh: "勇者印", en: "Brave Seal" },
    ],
  },
  "frankenstein": {
    title: { zh: "意外科学先驱", en: "Accidental Science Pioneer" },
    verdict: {
      zh: "所有看似脱轨的翻车，都是通往全新发明的电光火花。你的折腾令人着迷！",
      en: "Every glorious mishap is just electric sparks leading toward breakthrough discoveries!",
    },
    warmClosing: {
      zh: "不用担心螺丝松了，真正的杰作总带不羁的痕迹。晚安，创客。",
      en: "Never fear loose bolts; true masterpieces always carry wild traces. Rest well, inventor.",
    },
    tags: [
      { zh: "大创客", en: "Wild Maker" },
      { zh: "火花客", en: "Spark Pioneer" },
    ],
  },
  "werewolf": {
    title: { zh: "月下终极破压狂客", en: "Full-Moon Pressure Breaker" },
    verdict: {
      zh: "将所有憋屈和规矩撕碎在月光下，这一记嚎叫痛快淋漓，野性无双！",
      en: "Tore through polite facades beneath the full moon. That roar was pure untamed vitality!",
    },
    warmClosing: {
      zh: "今夜月亮为你圆满！卸下包袱，好好睡个野性的大觉！嗷呜！",
      en: "The moon shines for you tonight! Cast off all burdens and sleep like a wolf! AWOOO!",
    },
    tags: [
      { zh: "月下客", en: "Moon Howler" },
      { zh: "破压王", en: "Stress Slayer" },
    ],
  },
  "vampire": {
    title: { zh: "暗夜优雅独行伯爵", en: "Midnight Aristocratic Sovereign" },
    verdict: {
      zh: "在众生皆睡的夜幕里，你的孤独闪烁着高贵品味。无需迎合平庸的喧嚣。",
      en: "In the sacred midnight quiet, your solitary tastes shine with aristocratic elegance.",
    },
    warmClosing: {
      zh: "愿你在永恒的静谧中彻底恢复电量。黑夜永远庇护清醒的灵魂。夜安。",
      en: "May the velvet stillness fully recharge your soul. Night shelters the awake. Good night.",
    },
    tags: [
      { zh: "夜行者", en: "Night Sovereign" },
      { zh: "高雅客", en: "Pure Elegance" },
    ],
  },
};

export function createFallbackIdentity(session: Session, sourceTurnId: string): IdentityResult {
  const data = FALLBACK_MAP[session.characterId] ?? FALLBACK_MAP["meng-po"];
  return IdentityResult.parse({
    id: randomUUID(),
    sessionId: session.id,
    characterId: session.characterId,
    generatedAt: Date.now(),
    fallback: true,
    title: data.title,
    verdict: data.verdict,
    warmClosing: data.warmClosing,
    tags: data.tags,
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

  const systemPrompt = characterSystemPrompt(session.characterId);

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error("GENERATION_ABORTED");
    const deadline = new AbortController();
    const timeout = setTimeout(() => deadline.abort(), 4500);
    const activeSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    try {
      const raw = await completeJson(config, systemPrompt, payload, activeSignal);
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

  if (signal?.aborted) throw new Error("GENERATION_ABORTED");
  // Fallback if model generation repeatedly failed
  return createFallbackIdentity(session, storyTurns[0].id);
}
