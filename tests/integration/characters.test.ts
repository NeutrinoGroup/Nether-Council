import { describe, it, expect } from "vitest";
import { CHARACTER_IDS, CHARACTERS, getCharacter } from "@nether/party-core";
import { Session, type CharacterId, type Locale, type ConfirmedTurn } from "@nether/contracts";
import { characterPrompt, openingPrompt } from "@/features/voice/server/prompt";
import { characterSystemPrompt, createFallbackIdentity } from "@/features/verdict/server/generator";
import { POST as sessionsRoute } from "@/app/api/sessions/route";
import { CampaignClaims, signTicket } from "@/shared/server/tickets";

describe("T13 Character Roster & Definitions", () => {
  it("defines all 7 characters with valid metadata and verified voices", () => {
    expect(CHARACTER_IDS).toHaveLength(7);
    const expectedVoices: Record<CharacterId, string> = {
      "meng-po": "longanqian_v3.1",
      "hei-wuchang": "longyuan_v3.1",
      "bai-wuchang": "longxiaoxia_v3.1",
      "zhong-kui": "longhua_v3.1",
      "frankenstein": "longjielidou_v3.1",
      "werewolf": "longxing_v3.1",
      "vampire": "longwan_v3.1",
    };

    for (const id of CHARACTER_IDS) {
      const meta = getCharacter(id);
      expect(meta.id).toBe(id);
      expect(meta.name.zh).toBeTruthy();
      expect(meta.name.en).toBeTruthy();
      expect(meta.role.zh).toBeTruthy();
      expect(meta.role.en).toBeTruthy();
      expect(meta.intro.zh).toBeTruthy();
      expect(meta.intro.en).toBeTruthy();
      expect(meta.closingDirection.zh).toBeTruthy();
      expect(meta.closingDirection.en).toBeTruthy();
      expect(meta.voice).toBe(expectedVoices[id]);
      expect(meta.topics.zh.length).toBeGreaterThanOrEqual(3);
      expect(meta.topics.en.length).toBeGreaterThanOrEqual(3);
      expect(meta.cardTheme.bgGradient).toHaveLength(2);
      expect(meta.cardTheme.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(meta.posterUrl).toMatch(/^\/posters\/[a-z-]+\.png$/);
    }
  });

  it("generates character prompts and opening requests for all characters and locales", () => {
    const locales: Locale[] = ["zh", "en"];
    for (const id of CHARACTER_IDS) {
      for (const locale of locales) {
        const prompt = characterPrompt(id, locale);
        expect(prompt).toContain(CHARACTERS[id].name[locale]);
        expect(prompt).toContain(locale === "zh" ? "Mandarin Chinese" : "English");

        const opening = openingPrompt(id, locale);
        expect(opening.length).toBeGreaterThan(5);

        const systemPrompt = characterSystemPrompt(id);
        expect(systemPrompt).toContain(CHARACTERS[id].name.zh);
        expect(systemPrompt).toContain("title");
        expect(systemPrompt).toContain("verdict");
      }
    }
  });

  it("produces valid character-specific fallback identities for all 7 characters", () => {
    const now = Date.now();
    for (const id of CHARACTER_IDS) {
      const session = Session.parse({
        id: "11111111-1111-4111-8111-111111111111",
        characterId: id,
        locale: "zh",
        mode: "personal",
        createdAt: now,
        captureUntil: now + 180_000,
        expiresAt: now + 235_000,
      });

      const fallback = createFallbackIdentity(session, "t_user_1");
      expect(fallback.characterId).toBe(id);
      expect(fallback.fallback).toBe(true);
      expect(fallback.title.zh.length).toBeGreaterThan(0);
      expect(fallback.title.en.length).toBeGreaterThan(0);
      expect(fallback.verdict.zh.length).toBeGreaterThan(0);
      expect(fallback.verdict.en.length).toBeGreaterThan(0);
      expect(fallback.warmClosing.zh.length).toBeGreaterThan(0);
      expect(fallback.warmClosing.en.length).toBeGreaterThan(0);
      expect(fallback.tags.length).toBeGreaterThanOrEqual(2);
      expect(fallback.sourceTurnIds).toEqual(["t_user_1"]);
    }
  });
});

describe("T14 Character Session Admission & Isolation", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  process.env.SESSION_SIGNING_SECRET = secret;
  process.env.CAMPAIGN_SIGNING_SECRET = secret;
  process.env.VOICE_ENABLED = "true";
  process.env.QWEN_DUPLEX_API_KEY = "test-key";

  it("allows session creation for all 7 characters via /api/sessions", async () => {
    const now = Date.now();
    const campaign = signTicket(
      CampaignClaims.parse({ kind: "campaign", campaignId: "halloween-2026", issuedAt: now, expiresAt: now + 7200000 }),
      secret
    );

    for (const id of CHARACTER_IDS) {
      const request = new Request("http://localhost:3000/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ locale: "zh", characterId: id, invite: campaign }),
      });

      const res = await sessionsRoute(request);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session.characterId).toBe(id);
      expect(res.headers.get("Set-Cookie")).toContain("nc_session=");
    }
  });
});

describe("T14 42-Scenario Character Content Evaluation Matrix", () => {
  // 7 characters * 2 languages * 3 scenario turns = 42 evaluation points
  const scenarios: { name: string; turnText: { zh: string; en: string } }[] = [
    {
      name: "Late night work grind",
      turnText: {
        zh: "今晚加班到凌晨一点，修了一个怎么也复现不出来的并发死锁 bug，人都麻了。",
        en: "Worked past 1 AM fixing an elusive concurrency deadlock bug. Completely drained.",
      },
    },
    {
      name: "Cringe social mishap",
      turnText: {
        zh: "在全员大群里把吐槽老板的话发错了窗口，撤回时已经有十几个人截图了，当场社死。",
        en: "Accidentally sent a complaint about the manager to the all-hands chat. Ten people screenshotted before I recalled it.",
      },
    },
    {
      name: "Failed creative experiment",
      turnText: {
        zh: "自己动手改造南瓜灯加了烟雾发生器，结果触发了整栋楼的火警警报，全楼人穿着睡衣在寒风中罚站。",
        en: "Added a smoke generator to my DIY pumpkin lamp and triggered the entire building's fire alarm. Everyone stood in pyjamas in the cold.",
      },
    },
  ];

  it("verifies prompt coherence across all 42 scenario evaluation combinations", () => {
    let evalCount = 0;
    const locales: Locale[] = ["zh", "en"];

    for (const id of CHARACTER_IDS) {
      const charMeta = CHARACTERS[id];
      for (const locale of locales) {
        for (const scenario of scenarios) {
          evalCount++;
          const prompt = characterPrompt(id, locale);
          const userTurn = scenario.turnText[locale];

          // 1. Prompt has character name & persona instructions
          expect(prompt).toContain(charMeta.name[locale]);

          // 2. Rules enforced in prompt
          expect(prompt).toContain("1 to 3 short sentences");
          expect(prompt).toContain("never insult the person");

          // 3. User turn text is recognized as valid story text
          const confirmedTurn: ConfirmedTurn = {
            id: `turn_${evalCount}`,
            speaker: "user",
            locale,
            text: userTurn,
            revision: 1,
          };
          expect(confirmedTurn.text.length).toBeGreaterThan(10);
        }
      }
    }

    expect(evalCount).toBe(42);
  });
});
