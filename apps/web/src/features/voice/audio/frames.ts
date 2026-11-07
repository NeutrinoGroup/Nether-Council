type AudioFrame = (now: number) => void;
const subscribers: AudioFrame[] = [];
let frame = 0;

function tick(now: number) {
  frame = 0;
  for (let i = 0; i < subscribers.length; i++) subscribers[i](now);
  if (subscribers.length && !document.hidden) frame = requestAnimationFrame(tick);
}
function visibility() {
  cancelAnimationFrame(frame);
  // One final update clears activity when hidden; no hidden frames are queued.
  tick(performance.now());
}

/** All audio sampling runs before the waveform and altar draw in one RAF. */
export function subscribeAudioFrame(callback: AudioFrame, phase: "sample" | "draw" = "draw") {
  if (phase === "sample") subscribers.unshift(callback);
  else subscribers.push(callback);
  if (subscribers.length === 1) {
    document.addEventListener("visibilitychange", visibility);
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }
  return () => {
    const index = subscribers.indexOf(callback);
    if (index !== -1) subscribers.splice(index, 1);
    if (!subscribers.length) {
      cancelAnimationFrame(frame); frame = 0;
      document.removeEventListener("visibilitychange", visibility);
    }
  };
}
