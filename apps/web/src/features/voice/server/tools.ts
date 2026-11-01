import { UiAction, type UiAction as Action } from "@nether/contracts";

export const sceneTools = [
  { name: "change_mood", description: "Change the scene lighting to match the conversation.", properties: { mood: { type: "string", enum: ["calm", "warm", "storm", "laughing", "angry_support", "mystical", "healing"] } }, required: ["mood"] },
  { name: "extract_worry", description: "Place a short worry actually expressed by the guest into the bowl.", properties: { worry: { type: "string", minLength: 1, maxLength: 160 } }, required: ["worry"] },
  { name: "finish_ritual", description: "Display a blessing when the guest explicitly wants to finish the ritual. This does not create an identity card or end the session.", properties: { blessing: { type: "string", minLength: 1, maxLength: 160 } }, required: ["blessing"] },
].map(({ name, description, properties, required }) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } }));

export const sceneInstructions = "Use change_mood, extract_worry and finish_ritual sparingly to synchronize the scene with your words. Tool results are acknowledgements; continue speaking naturally after a tool call, without repeating the tool. Only extract worries the guest actually expressed. Only finish the ritual on their request.";

// Only complete, validated arguments execute. Never evaluate fragments or provider-supplied code.
export function parseTool(name: string, args: string): Action | undefined {
  if (args.length > 2048) return;
  try { return UiAction.parse({ action: name, data: JSON.parse(args) }); } catch { return; }
}
