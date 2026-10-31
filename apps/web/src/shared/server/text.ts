export type TextConfig = { key: string; baseUrl: string; model: string };
// Only server-side callers supply configuration; never accept an endpoint or key from a browser.
export async function completeJson(config: TextConfig, system: string, data: object, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", signal, headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(data) }], temperature: 0.2, max_tokens: 1600, enable_thinking: false, response_format: { type: "json_object" } }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error("TEXT_UNAVAILABLE"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("INVALID_TEXT_RESPONSE");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 32_768) throw new Error("TEXT_RESPONSE_TOO_LARGE"); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || body.choices?.[0]?.finish_reason !== "stop") throw new Error("INVALID_TEXT_RESPONSE");
  return JSON.parse(content);
}
