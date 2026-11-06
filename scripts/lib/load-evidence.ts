export type ConnectionWindow = { readyAtMs: number; closedAtMs: number };
export type ClientEvidence = { clientId: number; turnsAttempted: number; turnsSucceeded: number; connections: ConnectionWindow[] };

/** Longest window covered by ONE uninterrupted ready connection per distinct client.
 * Process elapsed time, staggered clients and disconnected gaps are not live concurrency.
 */
export function assessLoad(clients: ClientEvidence[], requiredDurationMs = 120_000) {
  const unique = new Set(clients.map(client => client.clientId));
  let commonReadyMs = 0;
  const valid = clients.map(client => client.connections.filter(window =>
    Number.isFinite(window.readyAtMs) && Number.isFinite(window.closedAtMs) && window.closedAtMs >= window.readyAtMs));
  if (clients.length > 0 && unique.size === clients.length) {
    for (const start of valid.flatMap(windows => windows.map(window => window.readyAtMs))) {
      const ends = valid.map(windows => Math.max(-Infinity, ...windows
        .filter(window => window.readyAtMs <= start && window.closedAtMs >= start)
        .map(window => window.closedAtMs)));
      commonReadyMs = Math.max(commonReadyMs, Math.min(...ends) - start);
    }
  }
  const totalTurnsAttempted = clients.reduce((sum, client) => sum + client.turnsAttempted, 0);
  const totalTurnsSucceeded = clients.reduce((sum, client) => sum + client.turnsSucceeded, 0);
  const durationRequirementMet = requiredDurationMs >= 120_000 && commonReadyMs >= requiredDurationMs;
  const targetAchieved = clients.length === 10 && unique.size === 10 &&
    clients.every(client => client.turnsAttempted === 3 && client.turnsSucceeded >= 0 && client.turnsSucceeded <= 3) &&
    totalTurnsAttempted === 30 && totalTurnsSucceeded >= 29 && durationRequirementMet;
  return { totalTurnsAttempted, totalTurnsSucceeded, commonReadyMs, durationRequirementMet, targetAchieved };
}
