import { mkdirSync } from "node:fs";
import { expect, test, type WebSocketRoute } from "./fixtures";

// Synthetic microphone and reply PCM exercise the real analyser/worklet graph.
// This verifies audio activity only, not audible output or facial animation.
for (const variant of ["stage", "immersive"] as const) {
  test(`${variant} dual waveform follows both channels, mute, interruption and reduced motion`, async ({ page }, info) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext(); await context.resume();
        const tone = context.createOscillator(), gain = context.createGain(), stream = context.createMediaStreamDestination();
        tone.frequency.value = 330; gain.gain.value = 0.025;
        tone.connect(gain).connect(stream); tone.start();
        return stream.stream;
      };
    });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const id = "11111111-1111-4111-8111-111111111111", now = Date.now();
    const session = { id, characterId: "meng-po", locale: "en", mode: "personal", createdAt: now, captureUntil: now + 180000, expiresAt: now + 235000 };
    let socket: WebSocketRoute, seq = 0;
    let stream: ReturnType<typeof setInterval> | undefined;
    try {
      const send = (event: object) => socket.send(JSON.stringify({ protocolVersion: 1, eventId: crypto.randomUUID(), sessionId: id, epoch: 0, seq: seq++, ...event }));
      await page.route("**/api/sessions", route => route.fulfill({ json: { session } }));
      await page.route("**/api/events", route => route.fulfill({ status: 202 }));
      await page.routeWebSocket("**/api/ws", ws => {
        socket = ws;
        ws.onMessage(raw => {
          const event = JSON.parse(String(raw));
          if (event.type === "session.start") {
            send({ type: "session.ready", session });
            // Complete the opening turn while assertions inspect the microphone.
            send({ type: "response.started", responseId: "opening" });
            send({ type: "response.done", responseId: "opening" });
          }
          if (event.type === "ping") send({ type: "pong" });
        });
      });
      await page.goto(`${variant === "stage" ? "/play" : "/"}?lang=en&invite=fixture`);
      if (variant === "immersive") await page.getByRole("button", { name: "Step inside. Meet Meng Po" }).click();
      const waveform = page.locator(variant === "stage" ? ".audio-band.dual-waveform" : ".encounter-glass .dual-waveform");
      await expect(waveform).toHaveAttribute("role", "status");
      await expect(waveform.locator(".waveform-bar")).toHaveCount(32);
      await expect(waveform).toHaveAttribute("data-waveform-state", "ended");
      await page.getByRole("button", { name: variant === "stage" ? "Turn on mic & meet Meng Po" : "Turn on mic & talk", exact: true }).click();
      await expect(waveform).toHaveAttribute("data-phase", "listening");
      await expect(waveform).toHaveAttribute("data-user-active", "true");
      await expect(waveform).toHaveAttribute("data-ai-active", "false");
      const level = (property: string) => waveform.evaluate((element, key) => Number((element as HTMLElement).style.getPropertyValue(key)), property);
      await expect.poll(() => level("--user-level")).toBeGreaterThan(0);
      send({ type: "speech.stopped" }); await expect(waveform).toHaveAttribute("data-waveform-state", "thinking");
      expect(await level("--ai-level")).toBe(0);
      send({ type: "response.started", responseId: "reply" });
      const pcm = Buffer.alloc(24000 * 2 / 4);
      for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 3000 / 24000) * 8000), i * 2);
      const audio = pcm.toString("base64");
      const append = () => send({ type: "audio.delta", responseId: "reply", audio });
      // Stream at playback speed so slower software-rendered CI does not drain
      // a finite clip before the mute, screenshot, and reduced-motion assertions.
      for (let i = 0; i < 4; i++) append();
      stream = setInterval(append, 250);
      await expect(waveform).toHaveAttribute("data-waveform-state", "speaking");
      await expect(waveform).toHaveAttribute("data-ai-active", "true");
      await expect.poll(() => level("--ai-level")).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Mute microphone", exact: true }).click();
      await expect(waveform).toHaveAttribute("data-muted", "true");
      await expect(waveform).toHaveAttribute("data-user-active", "false");
      await expect(waveform.locator(".waveform-muted")).toBeVisible();
      expect(await level("--user-level")).toBe(0);
      await expect(waveform).toHaveAttribute("data-ai-active", "true");
      await page.getByRole("button", { name: "Unmute microphone", exact: true }).click();
      await expect(waveform).toHaveAttribute("data-user-active", "true");
      mkdirSync(".impeccable/review", { recursive: true });
      await waveform.screenshot({ path: `.impeccable/review/${info.project.name}-${variant}-waveform.png` });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => level("--user-level")).toBe(0); expect(await level("--ai-level")).toBe(0);
      await expect(waveform).toHaveAttribute("data-ai-active", "true");
      expect(await waveform.locator(".waveform-bar").evaluateAll(elements => elements.every(element => (element as HTMLElement).style.getPropertyValue("--bar-scale") === "0"))).toBe(true);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.getByRole("button", { name: variant === "stage" ? "Interrupt Meng Po" : "Let me speak", exact: true }).click();
      clearInterval(stream); stream = undefined;
      send({ type: "response.done", responseId: "reply" });
      await expect(waveform).toHaveAttribute("data-waveform-state", "interrupted");
      expect(await level("--ai-level")).toBe(0);
      await expect(waveform).toHaveAttribute("data-ai-active", "false");
      await expect(waveform).toHaveAttribute("data-waveform-state", "listening");
      send({ type: "response.started", responseId: "next" }); await expect(waveform).toHaveAttribute("data-waveform-state", "thinking");
      send({ type: "speech.started" }); await expect(waveform).toHaveAttribute("data-waveform-state", "interrupted");
      await page.getByRole("button", { name: "End conversation", exact: true }).click();
      await expect(waveform).toHaveAttribute("data-waveform-state", "ended");
      expect(await level("--user-level")).toBe(0); expect(await level("--ai-level")).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    } finally { clearInterval(stream); }
  });
}
