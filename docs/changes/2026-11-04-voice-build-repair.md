# Production build and buffered-playback cancellation

Main referenced an auth header component before its files had landed in PR25. Remove that dangling import and JSX use so the independent voice page builds.

Browser CI then exposed a real fallback race:12seconds of queued PCM can outlast the3second interval since the last network packet. The response timer switched the still-playing conversation into a local demo, closing the live socket before the user clicked Interrupt. Defer that response timeout while output remains buffered; heartbeat loss still detects an unresponsive socket, and normal reply deadlines remain active after playback drains.

Add a fake-clock regression proving buffered playback stays live beyond3seconds and manual interruption emits response.cancel for the original response. Reset isPlaying to false before each realtime-state test; the local-VAD test previously leaked a true mock return value into the following silence test.

Validation:81 tests passed on the combined auth+voice tree, including the new cancellation and existing silence/heartbeat cases. Lint passed on that tree. Earlier main CI passed typecheck, unit/integration tests, assets and build; its two immersive browser cases failed on this now-corrected cancellation race (40other browser cases passed). New browser CI remains pending at publication. Synthetic PCM tests do not certify a real provider call or human microphone.
