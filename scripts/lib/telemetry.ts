import { TelemetryEvent } from "@nether/contracts";
export function deduplicate(events: TelemetryEvent[]): TelemetryEvent[] { return [...new Map(events.map(e => [e.eventId, e])).values()]; }
export function pilotReport(events: TelemetryEvent[]) {
  const unique = deduplicate(events);
  const users = (name: TelemetryEvent["name"]) => new Set(unique.filter(e => e.name === name && e.sessionId).map(e => e.sessionId)).size;
  return { events: unique.length, duplicates: events.length - unique.length, conversationsStarted: users("conversation_started"), conversationsCompleted: users("conversation_completed"), downloadsCreated: users("card_download_created"), shareInvoked: users("share_invoked"), referredConversationsStarted: users("referred_conversation_started"), note: "Download creation and share invocation do not prove a saved file or completed share. Participant counts and observed behavior require the real pilot log." };
}
