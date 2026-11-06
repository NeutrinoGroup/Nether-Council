import { test as base } from "@playwright/test";
export { expect, type WebSocketRoute } from "@playwright/test";

// Run the actual Web Audio graph with a silent sink. A headless Mac's physical
// sound device can leave currentTime frozen even when context.state is running.
// These tests verify PCM, Worklets and playback drain; they don't assess speakers.
export const test = base.extend<{ silentAudioSink: void }>({
  silentAudioSink: [async ({ page }, use) => {
    await page.addInitScript(() => {
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        constructor(options?: AudioContextOptions) {
          super({ ...options, sinkId: { type: "none" } } as AudioContextOptions);
        }
      };
    });
    await use();
  }, { auto: true }],
});
