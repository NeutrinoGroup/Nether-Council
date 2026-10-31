export function serverConfig() {
  return {
    voiceEnabled: process.env.VOICE_ENABLED === "true", sessionSecret: process.env.SESSION_SIGNING_SECRET ?? "", campaignSecret: process.env.CAMPAIGN_SIGNING_SECRET ?? "", referralSecret: process.env.REFERRAL_SIGNING_SECRET ?? "", hostSecret: process.env.HOST_ACCESS_SECRET ?? "",
    realtimeKey: process.env.QWEN_DUPLEX_API_KEY ?? "", realtimeUrl: process.env.QWEN_REALTIME_URL ?? "wss://maas.qianwenaiapi.com/api-ws/v1/realtime", realtimeModel: process.env.QWEN_REALTIME_MODEL ?? "qwen-audio-3.1-realtime-plus", campaignId: process.env.NEXT_PUBLIC_CAMPAIGN_ID ?? "halloween-2026",
    text: { key: process.env.QWEN_TEXT_API_KEY || process.env.QWEN_DUPLEX_API_KEY || "", baseUrl: process.env.QWEN_TEXT_BASE_URL ?? "https://maas.qianwenaiapi.com/compatible-mode/v1", model: process.env.QWEN_TEXT_MODEL ?? "qwen3.6-flash" },
  };
}
