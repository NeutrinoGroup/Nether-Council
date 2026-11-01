// Cache the bundled worklet in memory while the page has connectivity. A blob URL
// keeps demo playback usable after connectivity disappears, even before first mic use.
let moduleUrl: Promise<string> | undefined;
export function preloadAudioWorklet() {
  if (!moduleUrl) moduleUrl = fetch("/worklets/capture.js", { cache: "force-cache" }).then(async response => {
    if (!response.ok) throw new Error("WORKLET_UNAVAILABLE");
    return URL.createObjectURL(new Blob([await response.text()], { type: "text/javascript" }));
  }).catch(error => { moduleUrl = undefined; throw error; });
  return moduleUrl;
}
