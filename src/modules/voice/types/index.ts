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
