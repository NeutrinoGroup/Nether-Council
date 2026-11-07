export type MeasurementMode = "simulated" | "provider" | "acoustic";

export type TurnLatencySample = {
  turnIndex: number;
  responseId: string;
  mode: MeasurementMode;
  handshakeMs?: number;
  vadSpeechMs?: number;
  serverTurnToResponseMs?: number;
  serverTurnToFirstAudioMs?: number;
  clientTurnToResponseMs?: number;
  clientTurnToFirstAudioMs?: number;
  networkAndRelayEstimateMs?: number;
  queueBacklogMs?: number;
  playbackStartDelayMs?: number;
  endToEndPlaybackMs?: number;
  bargeInStopMs?: number;
  toolContinuationMs?: number;
  anomalous: boolean;
  anomalyReasons: string[];
};

const stages = [
  "handshakeMs", "vadSpeechMs", "serverTurnToResponseMs", "serverTurnToFirstAudioMs",
  "clientTurnToResponseMs", "clientTurnToFirstAudioMs", "networkAndRelayEstimateMs",
  "queueBacklogMs", "playbackStartDelayMs", "endToEndPlaybackMs", "bargeInStopMs", "toolContinuationMs",
] as const;
type Stage = typeof stages[number];
export type PercentileStats = { count: number; min: number; p50: number; p95: number; max: number; mean: number };
export type LatencyObservatorySummary = {
  mode: MeasurementMode;
  totalTurns: number;
  failedTurns: number;
  failureRate: number;
  anomalousTurns: number;
  stages: Partial<Record<Stage, PercentileStats>>;
  bottleneckStage: string;
};
type SampleInput = Omit<TurnLatencySample, "anomalous" | "anomalyReasons" | "networkAndRelayEstimateMs" | "endToEndPlaybackMs">;
const validDuration = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0;

// Linear interpolation between adjacent ranks; never mutate callers' samples.
export function computePercentileStats(values: number[]): PercentileStats | undefined {
  const sorted = values.filter(validDuration).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const percentile = (fraction: number) => {
    const rank = (sorted.length - 1) * fraction;
    const lower = Math.floor(rank);
    return sorted[lower] + (sorted[Math.ceil(rank)] - sorted[lower]) * (rank - lower);
  };
  return { count: sorted.length, min: sorted[0], p50: percentile(0.5), p95: percentile(0.95), max: sorted[sorted.length - 1], mean: sorted.reduce((sum, value) => sum + value / sorted.length, 0) };
}

export function evaluateTurnSample(sample: SampleInput): TurnLatencySample {
  const result: TurnLatencySample = { ...sample, anomalous: false, anomalyReasons: [] };
  delete result.networkAndRelayEstimateMs;
  delete result.endToEndPlaybackMs;
  for (const stage of stages) {
    if (result[stage] !== undefined && !validDuration(result[stage])) {
      result.anomalyReasons.push(`invalid:${stage}`);
      delete result[stage];
    }
  }
  if (result.clientTurnToFirstAudioMs !== undefined) {
    result.endToEndPlaybackMs = result.clientTurnToFirstAudioMs + (result.queueBacklogMs ?? 0);
    if (result.serverTurnToFirstAudioMs !== undefined) {
      // Subtract elapsed durations only. Client and server clocks need not agree.
      result.networkAndRelayEstimateMs = Math.max(0, result.clientTurnToFirstAudioMs - result.serverTurnToFirstAudioMs);
    }
  }
  for (const [start, end] of [["serverTurnToResponseMs", "serverTurnToFirstAudioMs"], ["clientTurnToResponseMs", "clientTurnToFirstAudioMs"]] as const) {
    if (result[start] !== undefined && result[end] !== undefined && result[end]! < result[start]!) result.anomalyReasons.push(`out_of_order:${end}`);
  }
  // Diagnostic budgets, not provider SLAs or evidence of acoustic latency.
  const budgets: Partial<Record<Stage, number>> = { handshakeMs: 5000, serverTurnToFirstAudioMs: 2500, endToEndPlaybackMs: 3000, queueBacklogMs: 500, playbackStartDelayMs: 500, bargeInStopMs: 150, toolContinuationMs: 2000 };
  for (const stage of stages) {
    const budget = budgets[stage];
    if (budget !== undefined && result[stage] !== undefined && result[stage]! > budget) result.anomalyReasons.push(`slow:${stage}`);
  }
  result.anomalous = result.anomalyReasons.length > 0;
  return result;
}

export function summarizeLatencySamples(samples: TurnLatencySample[], options: { mode?: MeasurementMode; failedTurns?: number } = {}): LatencyObservatorySummary {
  // Never combine simulated, provider and acoustic evidence in one baseline.
  const mode = options.mode ?? samples[0]?.mode ?? "simulated";
  const selected = samples.filter(sample => sample.mode === mode);
  const failedTurns = validDuration(options.failedTurns) ? Math.floor(options.failedTurns) : 0;
  const totalTurns = selected.length + failedTurns;
  const statistics: LatencyObservatorySummary["stages"] = {};
  for (const stage of stages) {
    const stats = computePercentileStats(selected.flatMap(sample => sample[stage] === undefined ? [] : [sample[stage]!]));
    if (stats) statistics[stage] = stats;
  }
  // Compare components of turn latency. Speech length, connection setup and
  // cumulative end-to-end totals are not competing response bottlenecks.
  const candidates: Stage[] = ["serverTurnToFirstAudioMs", "networkAndRelayEstimateMs", "queueBacklogMs", "playbackStartDelayMs", "toolContinuationMs"];
  const bottleneckStage = candidates.filter(stage => statistics[stage]).sort((a, b) => statistics[b]!.p95 - statistics[a]!.p95)[0] ?? "unavailable";
  return { mode, totalTurns, failedTurns, failureRate: totalTurns ? failedTurns / totalTurns : 0, anomalousTurns: selected.filter(sample => sample.anomalous).length, stages: statistics, bottleneckStage };
}
