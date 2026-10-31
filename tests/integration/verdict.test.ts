import { describe, expect, test, vi } from "vitest";
import { type ConfirmedTurn, type Session, IdentityResult } from "@nether/contracts";
import { createFallbackIdentity, generateIdentity } from "../../apps/web/src/features/verdict/server/generator";
import { POST as verdictRoute } from "../../apps/web/src/app/api/verdict/route";
import { POST as referralRoute } from "../../apps/web/src/app/api/referrals/route";
import { signTicket } from "../../apps/web/src/shared/server/tickets";

const sessionId = "22222222-2222-4222-8222-222222222222";
const now = Date.now();
const session: Session = {
  id: sessionId,
  characterId: "meng-po",
  locale: "zh",
  mode: "personal",
  createdAt: now,
  captureUntil: now + 180_000,
  expiresAt: now + 235_000,
};

const storyTurns: ConfirmedTurn[] = [
  { id: "t1", speaker: "character", locale: "zh", text: "今晚想忘掉什么离谱事？", revision: 1 },
  { id: "t2", speaker: "user", locale: "zh", text: "今天开了五场跨部门会议，需求一个字都没定下来。", revision: 1 },
];

describe("Identity verdict generation", () => {
  test("rejects when no valid story turns exist with NO_STORY", async () => {
    const turns: ConfirmedTurn[] = [
      { id: "t1", speaker: "character", locale: "zh", text: "今晚想忘掉什么？", revision: 1 },
      { id: "t2", speaker: "user", locale: "zh", text: "好的", revision: 1 },
    ];
    await expect(generateIdentity(session, turns, { key: "k", baseUrl: "http://b", model: "m" })).rejects.toThrow("NO_STORY");
  });

  test("creates valid fallback identity conforming to IdentityResult schema", () => {
    const fallback = createFallbackIdentity(session, "t2");
    expect(IdentityResult.parse(fallback)).toEqual(fallback);
    expect(fallback.fallback).toBe(true);
    expect(fallback.sourceTurnIds).toContain("t2");
    expect(fallback.title.zh.length).toBeLessThanOrEqual(18);
    expect(fallback.title.en.length).toBeLessThanOrEqual(64);
  });

  test("returns validated IdentityResult when text completions succeed", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let read = false;
          return {
            read: () => {
              if (read) return Promise.resolve({ done: true, value: undefined });
              read = true;
              const content = JSON.stringify({
                title: { zh: "黄泉散会专员", en: "Afterlife Meeting Adjourner" },
                verdict: {
                  zh: "五场会议无一落地，南瓜汤里捞出的尽是待确认的日程。",
                  en: "Five meetings without a resolution; your pumpkin soup is full of unconfirmed invites.",
                },
                warmClosing: {
                  zh: "喝了这碗汤，散掉无用会。今晚早点睡。",
                  en: "Drink this soup and leave the pointless meetings behind. Sleep early tonight.",
                },
                tags: [
                  { zh: "静音大师", en: "Mute Master" },
                  { zh: "会议逃兵", en: "Meeting Dodger" },
                ],
                sourceTurnIds: ["t2"],
              });
              const raw = JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] });
              return Promise.resolve({ done: false, value: new TextEncoder().encode(raw) });
            },
            cancel: () => Promise.resolve(),
            releaseLock: () => {},
          };
        },
      },
    });

    vi.stubGlobal("fetch", mockFetch);
    try {
      const result = await generateIdentity(session, storyTurns, { key: "k", baseUrl: "http://b", model: "m" });
      expect(result.fallback).toBe(false);
      expect(result.title.zh).toBe("黄泉散会专员");
      expect(result.sourceTurnIds).toEqual(["t2"]);
      expect(result.sessionId).toBe(session.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("falls back to structured fallback identity when upstream fails", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));
    vi.stubGlobal("fetch", mockFetch);
    try {
      const result = await generateIdentity(session, storyTurns, { key: "k", baseUrl: "http://b", model: "m" });
      expect(result.fallback).toBe(true);
      expect(result.title.zh).toBe("黄泉夜巡客");
      expect(result.sourceTurnIds).toEqual(["t2"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Verdict and Referral HTTP API routes", () => {
  const secret = "t".repeat(32);
  process.env.SESSION_SIGNING_SECRET = secret;
  process.env.CAMPAIGN_SIGNING_SECRET = secret;
  process.env.REFERRAL_SIGNING_SECRET = secret;
  process.env.NEXT_PUBLIC_CAMPAIGN_ID = "halloween-2026";
  const campaign = { kind: "campaign", campaignId: "halloween-2026", issuedAt: now, expiresAt: now + 600_000 };
  const ticket = signTicket({ kind: "session", session, campaign, issuedAt: now, expiresAt: session.expiresAt }, secret);

  test("/api/verdict rejects requests without valid session cookie", async () => {
    const req = new Request("http://localhost:3000/api/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ sessionId, turns: storyTurns }),
    });
    const res = await verdictRoute(req);
    expect(res.status).toBe(401);
  });

  test("/api/verdict rejects session mismatch", async () => {
    const req = new Request("http://localhost:3000/api/verdict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://localhost:3000",
        cookie: `nc_session=${ticket}`,
      },
      body: JSON.stringify({ sessionId: "33333333-3333-4333-8333-333333333333", turns: storyTurns }),
    });
    const res = await verdictRoute(req);
    expect(res.status).toBe(403);
  });

  test("/api/referrals creates signed referral token and valid share url", async () => {
    const req = new Request("http://localhost:3000/api/referrals", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: `nc_session=${ticket}`,
      },
    });
    const res = await referralRoute(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { referral: string; shareUrl: string };
    expect(data.referral).toBeTruthy();
    expect(data.shareUrl).toContain("/play?invite=");
    expect(data.shareUrl).toContain("&ref=");
    expect(data.shareUrl).toContain("character=meng-po");
  });
});
