import { afterEach, expect, test, vi } from "vitest";
import type { Caption, CaptionTranslation } from "@nether/contracts";
import { createTranslator, TranslationQueue } from "../../apps/web/src/features/captions/server/translation-queue";
const caption: Caption = { sessionId: "11111111-1111-4111-8111-111111111111", epoch: 0, responseId: "a", segmentId: "a", revision: 1, sourceLocale: "en", sourceText: "Five meetings today.", speaker: "character", final: true };
const queues: TranslationQueue[] = [];
function queue(translate: ConstructorParameters<typeof TranslationQueue>[0]) { const emitted: CaptionTranslation[] = []; const q = new TranslationQueue(translate, t => emitted.push(t)); queues.push(q); return { q, emitted }; }
afterEach(() => { queues.splice(0).forEach(q => q.dispose()); vi.useRealTimers(); vi.unstubAllGlobals(); });
test("new revisions and response cancellation abort old jobs; noncooperative late output is discarded", async () => {
  const jobs: { resolve: (text: string) => void; signal: AbortSignal }[] = [];
  const { q, emitted } = queue((_, signal) => new Promise(resolve => jobs.push({ resolve, signal })));
  q.observe(caption); q.observe({ ...caption, revision: 2 });
  expect(jobs[0].signal.aborted).toBe(true);
  jobs[0].resolve("stale"); jobs[1].resolve("current"); await vi.waitFor(() => expect(emitted).toHaveLength(1));
  expect(emitted[0]).toMatchObject({ revision: 2, translatedText: "current" });
  q.observe({ ...caption, responseId: "b" }); q.invalidateResponse("a"); expect(jobs[2].signal.aborted).toBe(false);
  q.invalidateResponse("b"); expect(jobs[2].signal.aborted).toBe(true);
  jobs[2].resolve("cancelled"); await Promise.resolve(); expect(emitted).toHaveLength(1);
});
test("translation timeout retries once and degrades even if a provider ignores abort", async () => {
  vi.useFakeTimers(); const translate = vi.fn(() => new Promise<string>(() => {})); const { q, emitted } = queue(translate);
  q.observe(caption); await vi.advanceTimersByTimeAsync(3599); expect(emitted).toEqual([]);
  await vi.advanceTimersByTimeAsync(1); expect(translate).toHaveBeenCalledTimes(2);
  expect(emitted[0]).toMatchObject({ status: "unavailable", sourceText: caption.sourceText });
});
test("one pending passage per speaker; partials, clear and disposal invalidate work", async () => {
  const signals: AbortSignal[] = []; const { q, emitted } = queue((_, signal) => { signals.push(signal); return new Promise(() => {}); });
  q.observe(caption); q.observe({ ...caption, speaker: "user" }); expect(signals.every(s => !s.aborted)).toBe(true);
  q.observe({ ...caption, final: false }); expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
  q.clear(); expect(signals.every(s => s.aborted)).toBe(true);
  q.observe(caption); q.dispose(); q.observe(caption); expect(signals).toHaveLength(3); expect(signals[2].aborted).toBe(true);
  await Promise.resolve(); expect(emitted).toEqual([]);
});
test("missing config, long passages and exhausted budget preserve source without unbounded paid calls", async () => {
  const missing = queue(undefined); missing.q.observe(caption); expect(missing.emitted[0].status).toBe("unavailable");
  const translate = vi.fn(async () => "译文"); const { q, emitted } = queue(translate);
  q.observe({ ...caption, sourceText: "x".repeat(1201) }); expect(translate).not.toHaveBeenCalled();
  for (let i = 0; i < 25; i++) { q.observe({ ...caption, revision: i + 2 }); await vi.waitFor(() => expect(emitted).toHaveLength(i + 2)); }
  expect(translate).toHaveBeenCalledTimes(24); expect(emitted.at(-1)?.status).toBe("unavailable");
});
test("JSON adapter sends quoted dialogue, validates output and rejects truncated or oversized bodies", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translation: "五场会议。" }) } }] })));
  vi.stubGlobal("fetch", fetchMock);
  const translate = createTranslator({ key: "fixture", baseUrl: "https://text.example/v1/", model: "fixture-model" });
  expect(await translate(caption, new AbortController().signal)).toBe("五场会议。");
  const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(request[0]).toBe("https://text.example/v1/chat/completions");
  const body = JSON.parse(String(request[1].body)); expect(body.enable_thinking).toBe(false); expect(body.response_format).toEqual({ type: "json_object" });
  expect(JSON.parse(body.messages[1].content)).toEqual({ sourceLocale: "en", targetLocale: "zh", sourceText: caption.sourceText });
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"translation":"cut off"}' } }] })));
  await expect(translate(caption, new AbortController().signal)).rejects.toThrow("INVALID_TEXT_RESPONSE");
  fetchMock.mockImplementation(async () => new Response("x".repeat(32769)));
  await expect(translate(caption, new AbortController().signal)).rejects.toThrow("TEXT_RESPONSE_TOO_LARGE");
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"translation":"","extra":"bad"}' } }] })));
  await expect(translate(caption, new AbortController().signal)).rejects.toThrow();
});
