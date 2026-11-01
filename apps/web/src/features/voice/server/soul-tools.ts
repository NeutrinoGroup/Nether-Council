import { SoulAction } from "@nether/contracts";

export const soulTools = [
  { name: "change_mood", description: "Change Meng Po's expression while speaking: angry_support for bosses/work/bugs, laughing for laughter, mystical for brewing, healing for comfort.", properties: { mood: { type: "string", enum: ["laughing", "angry_support", "mystical", "healing"] } }, required: ["mood"] },
  { name: "extract_worry_keyword", description: "Show the core worry the guest actually shared as floating ghost text. Call during listening, before the ritual.", properties: { keyword: { type: "string", maxLength: 24 } }, required: ["keyword"] },
  { name: "trigger_soul_soup_ritual", description: "Immediately start drinking and dissolving worries into ash with the spoken pumpkin soup announcement. Required by the third user turn, or earlier when the guest is ready. Once per encounter, never at opening.", properties: { blessing_quote: { type: "string", maxLength: 60 } }, required: ["blessing_quote"] },
].map(({ name, description, properties, required }) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } }));

export function parseSoulCall(name: string, args: string) {
  try { return SoulAction.safeParse({ name, arguments: JSON.parse(args) }); }
  catch { return SoulAction.safeParse(null); }
}

export function soulStageInstruction(userTurns: number, ritualCompleted: boolean) {
  if (ritualCompleted) return "仪式已完成，不要再次调用trigger_soul_soup_ritual；温柔陪聊或短句告别。";
  if (userTurns >= 3) return "已经收到至少3次用户有效发言。本轮必须高声说出南瓜汤收尾宣告，并立即调用trigger_soul_soup_ritual赐福，禁止再追问。";
  return `已收到${userTurns}次用户有效发言。${userTurns ? "倾听接梗，提炼烦恼关键词；用户说倾诉完毕或想喝汤时立即仪式，否则最多追问一个细节。" : "先热情招呼，尚无烦恼，不可触发仪式。"}`;
}
