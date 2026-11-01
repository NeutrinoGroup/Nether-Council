# Realtime audio and demo rehearsal

The browser captures mono PCM16LE at **16kHz**, in 20ms frames, and plays Qwen's
**24kHz** PCM through a separate AudioWorklet ring queue. Device sample rates
(44.1/48kHz) are converted continuously without resetting phase between chunks.
No ScriptProcessorNode is used. The playback queue caps at 12 seconds; overflow
fails over instead of silently growing latency.

`input_audio_buffer.speech_started` becomes `speech.started`. The client clears
the worklet queue, advances its playback generation, cancels the active response,
rejects late audio/captions/tool commands for that response, and moves the 3D body
into its listening pose. Main-thread playback state clears immediately; actual
output follows when the audio thread processes the clear message (plus the audio
device's existing output buffer). `stopMs` measures dispatch time, not an acoustic
latency guarantee. Optional `new VoiceClient(notify, { localVad: true })` enables a
60ms sustained-energy detector with 200ms release; server VAD is the default to
avoid echo-triggered interruptions in noisy rooms.

## Before going on stage

1. Open `/play?invite=...&lang=zh` (or enter the immersive encounter from the home page).
   Let the page preload its worklet and three local PCM clips; both languages ship
   with the app. The worklet is kept as an in-memory blob and PCM clips as in-memory
   promises, so playback survives loss of the network after preload.
2. Start with a real click to unlock audio. Check microphone permissions, volume,
   echo cancellation and the actual room's speaker/microphone setup.
3. Press **Shift + D** with focus outside an input to enter demo immediately. This
   closes live sockets and capture, cancels reconnect/deadline work, isolates late
   callbacks, and plays the recorded introduction. It requires no invite or mic.
   Repeated keydown is ignored; typing a capital D in a field cannot activate it.
4. Use **Or type your message / 也可以打字说**. The first submitted line advances the
   scripted meeting worry; the next advances the blessing and final highlight.
   Interrupt stops the local speech; End conversation releases all audio resources.
   Click the normal start button to return to live mode with a fresh client.
5. Rehearse denied microphone, pending permission, network loss and server silence.
   Connection/first-reply waits and reply gaps switch after 3 seconds without
   progress. `speech.stopped` starts the reply timer; `speech.started` cancels it.
   Generation completion stops the timer while queued audio finishes. The app also
   pings the edge every second and switches when a ping has no pong for 3 seconds.
   Ordinary silence with a healthy connection never switches to demo.

Both `/play` and the new immersive home-page encounter share this client, fallback
form, timers and scene state. `UI_ACTION` updates mood lights immediately and puts
worry/blessing text into the scene. Existing `soul.action` remains supported.

Demo is visibly marked **scripted story and recorded voice**. It never submits the
script as a real guest's story, creates a result, or triggers identity generation.
The text field in live mode sends `text.submit` through the same authenticated
session to Qwen. In demo it only advances the local script.

The recordings are built-in macOS Tingting (zh) and Samantha (en) synthetic voices,
190 words/minute, converted to 24kHz mono PCM16LE; the exact transcript is in
`apps/web/src/features/voice/demo.ts`. They are fallback performances, not Qwen
voice clones. If playback is unavailable, the script and scene remain available
with an explicit audio-unavailable message. Reloading a page for the first time
without a network cannot load the application; this is not a service-worker PWA.
No browser can guarantee sound with a muted device or a closed laptop.

## Protocol references

- [Qwen 3.1 client events: tools, PCM rates, cancel and function output](https://platform.qianwenai.com/docs/api-reference/qwen-audio-realtime/client-events)
- [Qwen server events: VAD and complete function arguments](https://platform.qianwenai.com/docs/api-reference/qwen-audio-realtime/server-events)
- [FastAPI gateway setup and cross-service checks](../../services/voice/README.md)

Run `pnpm test:voice`, `pnpm verify:voice-gateway`, `pnpm test:e2e:realtime` and the
normal repository checks before deployment. `playwright.realtime.config.ts` uses
port 3208 and separate output artifacts so it can be distinguished from the
existing browser suites. The realtime suite uses its own `.next-realtime` build directory through
NEXT_BUILD_DIR, so another development server can remain running.

The Chromium suite uses `sinkId: { type: "none" }` only in its test harness to
execute the real audio graph without depending on the host sound device. It
verifies PCM processing and queue drain, not audible output from speakers.
