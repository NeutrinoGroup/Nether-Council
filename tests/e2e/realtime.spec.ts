import { expect, test, type WebSocketRoute } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
// Keep real-time worklet rendering independent of the host's shared CoreAudio device.
// This virtual sink still advances the audio clock and executes the real processors.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) { super({ ...options, sinkId: { type: "none" } } as AudioContextOptions); }
    };
  });
});

test("Shift D uses preloaded recorded speech offline, changes the scene and completes the scripted ritual", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const loaded = new Set<string>();
  page.on("requestfinished", request => { if (/\/demo\/en-\d.pcm|\/worklets\/capture.js/.test(request.url())) loaded.add(new URL(request.url()).pathname); });
  await page.goto("/play?lang=en");
  await expect.poll(() => loaded.size).toBe(4);
  await expect.poll(() => page.locator(".character-stage").getAttribute("data-model-loaded"), { timeout: 20000 }).toBe("true");
  await context.setOffline(true);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Shift+KeyD");
  await expect(page.getByText("Demo mode · scripted story and recorded voice")).toBeVisible();
  await expect(page.locator(".character-stage")).toHaveAttribute("data-mood", "warm");
  await expect.poll(async () => Number(await page.locator(".character-stage").getAttribute("data-mouth-level"))).toBeGreaterThan(0);
  await page.getByLabel("Or type your message").fill("Those meetings");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".ritual-worry")).toHaveText("Endless meetings");
  await page.getByLabel("Or type your message").fill("Let it go");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".ritual-blessing")).toHaveText("May tomorrow feel lighter");
  await page.getByRole("button", { name: "Interrupt Meng Po", exact: true }).click();
  await expect.poll(async () => Number(await page.locator(".character-stage").getAttribute("data-mouth-level"))).toBe(0);
  await page.getByRole("button", { name: "End conversation", exact: true }).click();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("ready socket without reply switches to demo after 3 seconds", async ({ page }) => {
  const now = Date.now();
  const session = { id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
  await page.routeWebSocket("**/api/ws", socket => { socket.onMessage(() => {}); });
  await page.goto("/play?invite=fixture&lang=en");
  await expect(page.locator(".character-stage")).toHaveAttribute("data-model-loaded", "true", { timeout: 20000 });
  const before = Date.now();
  await page.getByRole("button", { name: "Turn on mic & meet Meng Po" }).click();
  await expect(page.getByText("Demo mode · scripted story and recorded voice")).toBeVisible({ timeout: 4000 });
  expect(Date.now() - before).toBeLessThan(4000);
});

test("microphone denied still plays the demo and supports typed continuation", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/play?invite=fixture&lang=zh");
  await page.getByRole("button", { name: "开麦，找孟婆聊聊" }).click();
  await expect(page.getByText("演示模式 · 预置故事与语音")).toBeVisible();
  await expect.poll(async () => Number(await page.locator(".character-stage").getAttribute("data-mouth-level")), { timeout: 20000 }).toBeGreaterThan(0);
  await page.getByLabel("也可以打字说").fill("我想放下烦恼");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".ritual-worry")).toHaveText("开不完的会");
});

test("live UI_ACTION controls lighting; server VAD silences buffered PCM and ignores stale commands", async ({ page }) => {
  const now = Date.now(); let socket: WebSocketRoute; let seq = 0;
  const messages: Record<string, unknown>[] = [];
  const pcm = Buffer.alloc(24000 * 2 * 6);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 15) * 3000), i * 2);
  const session = { id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
  const send = (event: object) => socket.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...event }));
  await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
  await page.route("**/api/events", route => route.fulfill({ status: 202 }));
  await page.routeWebSocket("**/api/ws", ws => { socket = ws; ws.onMessage(raw => {
    const event = JSON.parse(String(raw)); messages.push(event);
    if (event.type === "session.start" && !event.prewarm) {
      send({ type: "session.ready", session }); send({ type: "response.started", responseId: "r1" });
      for (let i = 0; i < pcm.length; i += 24000) send({ type: "audio.delta", responseId: "r1", audio: pcm.subarray(i, i + 24000).toString("base64") });
      send({ type: "UI_ACTION", responseId: "r1", callId: "c1", payload: { action: "change_mood", data: { mood: "storm" } } });
      send({ type: "response.done", responseId: "r1" });
    }
    if (event.type === "ping") send({ type: "pong" });
  }); });
  await page.goto("/play?invite=fixture&lang=en");
  await expect(page.locator(".character-stage")).toHaveAttribute("data-model-loaded", "true", { timeout: 20000 });
  await page.getByRole("button", { name: "Turn on mic & meet Meng Po" }).click();
  await expect.poll(() => messages.some(event => event.type === "audio.append")).toBe(true);
  await expect(page.locator(".character-stage")).toHaveAttribute("data-mood", "storm");
  send({ type: "speech.started" });
  send({ type: "audio.delta", responseId: "r1", audio: "AAA=" });
  send({ type: "UI_ACTION", responseId: "r1", callId: "late", payload: { action: "change_mood", data: { mood: "warm" } } });
  await expect.poll(() => messages.some(event => event.type === "response.cancel")).toBe(true);
  await expect.poll(async () => Number(await page.locator(".character-stage").getAttribute("data-mouth-level"))).toBe(0);
  await expect(page.locator(".character-stage")).toHaveAttribute("data-mood", "storm");
});

test("immersive home-page encounter shares demo input, lighting and listening posture", async ({ page }) => {
  await page.goto("/?lang=en");
  await page.getByRole("button", { name: "Step inside. Meet Meng Po", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn on mic & talk", exact: true })).toBeVisible();
  await page.keyboard.press("Shift+KeyD");
  await expect(page.getByText("Demo mode · scripted story and recorded voice")).toBeVisible();
  await expect(page.locator(".theatre-stage canvas")).toHaveAttribute("data-mood", "warm", { timeout: 20000 });
  await page.getByLabel("Or type your message").fill("A meeting");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".ritual-worry")).toHaveText("Endless meetings");
  await page.getByRole("button", { name: "Let me speak", exact: true }).click();
  await expect(page.locator(".theatre-stage canvas")).toHaveAttribute("data-motion", "listening");
  await page.getByRole("button", { name: "End conversation", exact: true }).click();
});
