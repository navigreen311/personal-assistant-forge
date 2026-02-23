// ============================================================================
// Shadow Voice Agent — Telemetry Tracker
// Tracks per-request timing for every stage of the voice agent pipeline:
// STT, intent classification, context assembly, tool calls, response
// generation, TTS, and overall latency. Non-persistent (per-request).
// ============================================================================

// --- Types ---

export interface ToolCallTelemetry {
  tool: string;
  durationMs: number;
  status: string;
}

export interface TelemetrySnapshot {
  sttMs?: number;
  intentClassificationMs?: number;
  contextAssemblyMs?: number;
  toolCalls: ToolCallTelemetry[];
  responseGenerationMs?: number;
  ttsFirstByteMs?: number;
  totalMs: number;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
}

interface StageRecord {
  start: number;
  end?: number;
}

// --- Stage Name to Telemetry Field Mapping ---

const STAGE_TO_FIELD: Record<string, keyof TelemetrySnapshot> = {
  stt: 'sttMs',
  intent_classification: 'intentClassificationMs',
  context_assembly: 'contextAssemblyMs',
  response_generation: 'responseGenerationMs',
  tts_first_byte: 'ttsFirstByteMs',
};

// --- Telemetry Tracker ---

export class TelemetryTracker {
  private stages: Map<string, StageRecord> = new Map();
  private toolCallRecords: ToolCallTelemetry[] = [];
  private requestStart: number;
  private metadata: {
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
    cost?: number;
  } = {};

  constructor() {
    this.requestStart = Date.now();
  }

  /**
   * Start timing a named stage.
   * Common stage names: 'stt', 'intent_classification', 'context_assembly',
   * 'response_generation', 'tts_first_byte'.
   */
  startStage(name: string): void {
    this.stages.set(name, { start: Date.now() });
  }

  /**
   * End timing a named stage.
   * The stage must have been previously started.
   */
  endStage(name: string): void {
    const stage = this.stages.get(name);
    if (stage && !stage.end) {
      stage.end = Date.now();
    }
  }

  /**
   * Record a tool call with its duration and status.
   */
  addToolCall(tool: string, durationMs: number, status: string): void {
    this.toolCallRecords.push({ tool, durationMs, status });
  }

  /**
   * Set model metadata (model name, token counts, cost).
   */
  setModelMetadata(meta: {
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
    cost?: number;
  }): void {
    if (meta.model !== undefined) this.metadata.model = meta.model;
    if (meta.tokensIn !== undefined) this.metadata.tokensIn = meta.tokensIn;
    if (meta.tokensOut !== undefined) this.metadata.tokensOut = meta.tokensOut;
    if (meta.cost !== undefined) this.metadata.cost = meta.cost;
  }

  /**
   * Get the complete telemetry snapshot for this request.
   * Calculates totalMs from the request start time.
   */
  getTelemetry(): TelemetrySnapshot {
    const now = Date.now();
    const totalMs = now - this.requestStart;

    const snapshot: TelemetrySnapshot = {
      toolCalls: [...this.toolCallRecords],
      totalMs,
    };

    // Map stage timings to their fields
    for (const [stageName, record] of this.stages) {
      const fieldName = STAGE_TO_FIELD[stageName];
      if (fieldName && record.end) {
        const durationMs = record.end - record.start;
        // TypeScript needs explicit handling for each field type
        switch (fieldName) {
          case 'sttMs':
            snapshot.sttMs = durationMs;
            break;
          case 'intentClassificationMs':
            snapshot.intentClassificationMs = durationMs;
            break;
          case 'contextAssemblyMs':
            snapshot.contextAssemblyMs = durationMs;
            break;
          case 'responseGenerationMs':
            snapshot.responseGenerationMs = durationMs;
            break;
          case 'ttsFirstByteMs':
            snapshot.ttsFirstByteMs = durationMs;
            break;
        }
      }
    }

    // Attach model metadata
    if (this.metadata.model) snapshot.model = this.metadata.model;
    if (this.metadata.tokensIn !== undefined) snapshot.tokensIn = this.metadata.tokensIn;
    if (this.metadata.tokensOut !== undefined) snapshot.tokensOut = this.metadata.tokensOut;
    if (this.metadata.cost !== undefined) snapshot.cost = this.metadata.cost;

    return snapshot;
  }

  /**
   * Reset the tracker for a new request.
   */
  reset(): void {
    this.stages.clear();
    this.toolCallRecords = [];
    this.metadata = {};
    this.requestStart = Date.now();
  }
}

/**
 * Factory function to create a new telemetry tracker per request.
 * Do NOT use a singleton for this — each request needs its own tracker.
 */
export function createTelemetryTracker(): TelemetryTracker {
  return new TelemetryTracker();
}
