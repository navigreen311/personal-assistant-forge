// ============================================================================
// Voice Module — Type Definitions
// Session management, STT config, command parsing, and VoiceForge handoff
// ============================================================================

export interface VoiceSession {
  id: string;
  userId: string;
  entityId: string;
  status: 'LISTENING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  audioFormat: 'webm' | 'wav' | 'ogg' | 'mp3';
  sampleRate: number;
  startedAt: Date;
  endedAt?: Date;
  transcript?: string;
  confidence?: number; // 0-1
  parsedCommand?: ParsedVoiceCommand;
}

export interface ParsedVoiceCommand {
  intent: VoiceIntent;
  confidence: number;
  entities: ExtractedEntity[];
  rawTranscript: string;
  normalizedText: string;
}

export type VoiceIntent =
  | 'ADD_TASK'
  | 'SCHEDULE_MEETING'
  | 'DRAFT_EMAIL'
  | 'WHATS_NEXT'
  | 'ADD_NOTE'
  | 'CALL_CONTACT'
  | 'SET_REMINDER'
  | 'SEARCH'
  | 'CREATE_CONTACT'
  | 'LOG_EXPENSE'
  | 'DICTATE'
  | 'UNKNOWN';

export interface ExtractedEntity {
  type: 'PERSON' | 'DATE' | 'TIME' | 'DURATION' | 'MONEY' | 'LOCATION' | 'PRIORITY' | 'PROJECT' | 'TAG';
  value: string;
  normalized?: string; // e.g., "tomorrow" -> "2026-02-16"
  confidence: number;
}

export interface VoiceCommandDefinition {
  intent: VoiceIntent;
  patterns: string[]; // regex or keyword patterns
  examples: string[];
  handler: string; // service method name
  requiresConfirmation: boolean;
}

export interface STTConfig {
  provider: 'browser' | 'whisper' | 'deepgram' | 'assemblyai';
  language: string;
  model?: string;
  enablePunctuation: boolean;
  enableSpeakerDiarization: boolean;
  interimResults: boolean;
}

export interface WakeWordConfig {
  enabled: boolean;
  phrase: string; // e.g., "Hey Forge"
  sensitivity: number; // 0-1
  provider: 'browser' | 'porcupine' | 'custom';
}

export interface VoiceForgeHandoff {
  id: string;
  voiceSessionId: string;
  contactId: string;
  entityId: string;
  phoneNumber: string;
  context: string; // summary of conversation context to pass
  scriptHints: string[];
  status: 'PENDING' | 'CONNECTING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
}

export interface STTProvider {
  name: string;
  initialize(config: STTConfig): Promise<void>;
  processChunk(chunk: ArrayBuffer): Promise<{ interim: string; isFinal: boolean }>;
  getTranscript(): string;
  reset(): void;
}

// ============================================================================
// Wake Word Engine — Abstraction Layer
// Pluggable engines for wake word detection (browser, Picovoice, custom ML).
// ============================================================================

/** Status of the wake word detection service */
export type WakeWordStatus = 'idle' | 'listening' | 'detected' | 'error';

/** Event emitted when a wake word is detected */
export interface WakeWordDetectionEvent {
  /** The phrase that was detected */
  phrase: string;
  /** Detection confidence (0.0 - 1.0) */
  confidence: number;
  /** Timestamp of detection */
  timestamp: Date;
  /** Which engine produced the detection */
  engine: string;
}

/** Callback type for wake word detection events */
export type WakeWordCallback = (event: WakeWordDetectionEvent) => void;

/** Supported wake word engine identifiers */
export type WakeWordEngineType = 'browser' | 'porcupine' | 'mock' | 'custom';

/** Descriptor for a supported engine's capabilities */
export interface WakeWordEngineInfo {
  type: WakeWordEngineType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  supportedPlatforms: ('browser' | 'node' | 'electron')[];
  supportsCustomWakeWords: boolean;
}

/** Result from a self-test run */
export interface WakeWordTestResult {
  success: boolean;
  engineType: WakeWordEngineType;
  microphoneAvailable: boolean;
  engineInitialized: boolean;
  detectionWorking: boolean;
  latencyMs?: number;
  errors: string[];
}

/**
 * WakeWordEngine — The pluggable interface that all detection backends must
 * implement. The WakeWordService delegates to whichever engine is active.
 */
export interface WakeWordEngine {
  /** Unique name identifying this engine (e.g., 'browser', 'porcupine') */
  readonly engineType: WakeWordEngineType;

  /** Initialize the engine with the given config */
  initialize(config: WakeWordConfig): Promise<void>;

  /** Start processing audio for wake word detection */
  start(): Promise<void>;

  /** Stop processing audio */
  stop(): Promise<void>;

  /** Update the wake word phrase the engine listens for */
  setWakeWord(phrase: string): void;

  /** Update detection sensitivity (0.0 - 1.0) */
  setSensitivity(level: number): void;

  /** Process a single audio frame; returns true if wake word was detected */
  processAudioFrame(frame: Float32Array): boolean;

  /** Run a self-test to verify the engine is working */
  selfTest(): Promise<WakeWordTestResult>;

  /** Clean up any resources held by the engine */
  dispose(): Promise<void>;

  /** Current engine status */
  getStatus(): WakeWordStatus;

  /** Metadata about this engine */
  getInfo(): WakeWordEngineInfo;
}
