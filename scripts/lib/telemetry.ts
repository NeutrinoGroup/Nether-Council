import { TelemetryEvent } from "@nether/contracts";
export function deduplicate(events: TelemetryEvent[]): TelemetryEvent[] { return [...new Map(events.map(e => [e.eventId, e])).values()]; }
export function pilotReport(events: TelemetryEvent[]) {
  const unique = deduplicate(events).sort((a, b) => a.at - b.at || a.eventId.localeCompare(b.eventId));
  const key = (event: TelemetryEvent, id: string) => JSON.stringify([event.campaignId ?? null, id]);
  const sessions = (name: TelemetryEvent["name"]) => new Set(unique.filter(e => e.name === name && e.sessionId).map(e => key(e, e.sessionId!))).size;
  const identities = new Map<string, { visitorId: string; at: number }>();
  for (const event of unique) {
    if (!event.sessionId || !event.visitorId || !event.campaignId || event.name === "referred_conversation_started") continue;
    const sessionKey = key(event, event.sessionId);
    if (!identities.has(sessionKey)) identities.set(sessionKey, { visitorId: event.visitorId, at: event.at });
  }
  const startedSessions = new Set<string>();
  const startedVisitors = new Set<string>();
  let startedSessionsWithoutVisitor = 0;
  let referredConversationsStarted = 0;
  let referredStartsExcludedSelf = 0;
  let referredStartsExcludedReturning = 0;
  let referredStartsUnknown = 0;
  for (const event of unique) {
    if (event.name !== "conversation_started" || !event.sessionId) continue;
    const sessionKey = key(event, event.sessionId);
    if (startedSessions.has(sessionKey)) continue;
    startedSessions.add(sessionKey);
    const visitorKey = event.visitorId ? key(event, event.visitorId) : undefined;
    const returning = visitorKey !== undefined && startedVisitors.has(visitorKey);
    if (visitorKey) startedVisitors.add(visitorKey);
    else startedSessionsWithoutVisitor++;
    if (!event.sourceSessionId) continue;
    const source = identities.get(key(event, event.sourceSessionId));
    if (!event.campaignId || !event.visitorId || !source || source.at > event.at) referredStartsUnknown++;
    else if (source.visitorId === event.visitorId) referredStartsExcludedSelf++;
    else if (returning) referredStartsExcludedReturning++;
    else referredConversationsStarted++;
  }
  return {
    events: unique.length, duplicates: events.length - unique.length,
    conversationsStarted: startedSessions.size, conversationsCompleted: sessions("conversation_completed"),
    downloadsCreated: sessions("card_download_created"), shareInvoked: sessions("share_invoked"),
    startedVisitorsEstimate: startedVisitors.size, startedSessionsWithoutVisitor,
    referredConversationsStarted, referredStartsExcludedSelf, referredStartsExcludedReturning, referredStartsUnknown,
    note: "Funnel counts use distinct sessions; visitors and new referred starts use anonymous browser IDs per campaign within the collected window. Shared browsers, cleared storage, multiple devices and missing logs limit these estimates. They are not participant counts. Download creation and share invocation do not prove a saved file or completed share; those require the real pilot log.",
  };
}
