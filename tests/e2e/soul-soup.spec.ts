import { expect, test, type WebSocketRoute } from "./fixtures";
import { mkdirSync } from "node:fs";

for (const entrance of ["play", "home"] as const) {
for (const motion of ["reduce", "no-preference"] as const) {
test(`${entrance}: soul soup, mood and one blessing with motion=${motion}`, async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: motion });
  // Synthetic microphone feeds the real capture Worklet; no personal device needed.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); await context.resume();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator(); oscillator.frequency.value = 160;
      const gain = context.createGain(); gain.gain.value = 0.05;
      oscillator.connect(gain).connect(destination); oscillator.start();
      return destination.stream;
    };
  });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const id = crypto.randomUUID(), now = Date.now();
  const session = { id, characterId: "meng-po", locale: "zh", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  let socket: WebSocketRoute | undefined, seq = 0;
  const requests: Record<string, unknown>[] = [];
  const send = (payload: object) => socket!.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...payload }));
  const action = (callId: string, name: string, args: object, responseId = "story") => send({ type: "soul.action", responseId, callId, action: { name, arguments: args } });
  await page.route("**/api/sessions", r => r.fulfill({ json: { session } }));
  await page.route("**/api/events", r => r.fulfill({ status: 202 }));
  await page.routeWebSocket("**/api/ws", ws => {
    socket = ws;
    ws.onMessage(raw => { const e = JSON.parse(String(raw)); requests.push(e); if (e.type === "session.start" && !e.prewarm) send({ type: "session.ready", session }); if (e.type === "ping") send({ type: "pong" }); });
  });
  await page.goto(entrance === "play" ? "/play?lang=zh&invite=fixture" : "/?lang=zh&invite=fixture");
  if (entrance === "home") {
    await page.getByRole("button", { name: "推门，遇见孟婆" }).click();
    await expect(page.locator(".theatre")).toHaveAttribute("data-phase", "conversation", { timeout: 15000 });
    await page.getByRole("button", { name: "开麦，向孟婆倾诉" }).click();
  } else await page.locator(".start-button").click();
  await expect.poll(() => requests.filter(e => e.type === "audio.append").length).toBeGreaterThan(3);
  expect(requests.filter(e => e.type === "session.start")).toHaveLength(1);
  expect(requests.some(e => e.type === "session.end")).toBe(false);
  send({ type: "response.started", responseId: "story" });
  send({ type: "audio.delta", responseId: "story", audio: Buffer.alloc(24000).toString("base64") });
  action("m1", "change_mood", { mood: "angry_support" });
  action("w1", "extract_worry_keyword", { keyword: "改不完的需求" });
  send({ type: "response.done", responseId: "story" });
  const stage = page.locator(".soul-soup");
  await expect(stage).toHaveAttribute("data-mood", "angry_support");
  await expect(page.locator(".soul-worry")).toHaveText("改不完的需求");
  await expect(page.locator(".soul-soup")).toHaveCSS("--soul-fire", "#b06bff");
  await expect(page.locator(entrance === "play" ? ".character-stage" : ".theatre-stage")).toHaveAttribute("data-model-loaded", "true", { timeout: 20000 });
  mkdirSync("artifacts/soul-soup", { recursive: true });
  await page.screenshot({ path: `artifacts/soul-soup/${entrance}-${info.project.name}-listening-${motion}.png`, fullPage: true });
  send({ type: "response.started", responseId: "ritual" });
  send({ type: "audio.delta", responseId: "ritual", audio: Buffer.alloc(24000).toString("base64") });
  action("ritual", "trigger_soul_soup_ritual", { blessing_quote: "宜：下班要糖，忌：精神内耗" }, "ritual");
  action("duplicate", "trigger_soul_soup_ritual", { blessing_quote: "重复签文" }, "ritual");
  send({ type: "response.done", responseId: "ritual" });
  await expect(stage).toHaveAttribute("data-ritual", "true");
  await expect(page.locator(".soup-fortune")).toContainText("宜：下班要糖，忌：精神内耗");
  if (motion === "reduce") await expect(page.locator(".soul-worry")).toBeHidden();
  else await expect(page.locator(".soul-worry")).toHaveCSS("opacity", "0", { timeout: 5000 });
  await page.screenshot({ path: `artifacts/soul-soup/${entrance}-${info.project.name}-blessing-${motion}.png`, fullPage: true });
  send({ type: "speech.started" });
  action("stale-mood", "change_mood", { mood: "laughing" });
  await expect(stage).toHaveAttribute("data-mood", "mystical");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "结束对话", exact: true }).click();
  if (entrance === "play") await page.getByLabel("黑无常", { exact: true }).check();
  else await page.getByRole("button", { name: "返回人间" }).click();
  await expect(page.locator(".soup-fortune")).toHaveCount(0);
  await expect(page.locator(".soul-soup")).toHaveCount(0);
  expect(errors).toEqual([]);
});

}

}
