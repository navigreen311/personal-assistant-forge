// ============================================================================
// Speech-to-Text Service
// Manages voice sessions with pluggable STT provider interface.
// Default: browser Web Speech API. Extensible to Whisper/Deepgram/AssemblyAI.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  VoiceSession,
  STTConfig,
  STTProvider,
} from '@/modules/voice/types';
import { generateText } from '@/lib/ai';

const DEFAULT_STT_CONFIG: STTConfig = {
  provider: 'browser',
  language: 'en-US',
  enablePunctuation: true,
  enableSpeakerDiarization: false,
  interimResults: true,
};

// ---------------------------------------------------------------------------
// Browser STT Provider (default)
// In a real implementation this wraps the Web Speech API (SpeechRecognition).
// Server-side, it acts as a passthrough that accumulates text chunks.
// ---------------------------------------------------------------------------
class BrowserSTTProvider implements STTProvider {
  name = 'browser';
  private transcript = '';
  private config: STTConfig = DEFAULT_STT_CONFIG;

  async initialize(config: STTConfig): Promise<void> {
    this.config = config;
    this.transcript = '';
  }

  async processChunk(chunk: ArrayBuffer): Promise<{ interim: string; isFinal: boolean }> {
    // In a real browser environment, chunks would come from the MediaRecorder API
    // and be fed to SpeechRecognition. Here we simulate by decoding the chunk.
    const decoder = new TextDecoder();
    const text = decoder.decode(chunk);

    if (text.trim()) {
      this.transcript += (this.transcript ? ' ' : '') + text.trim();
      return { interim: this.transcript, isFinal: false };
    }

    return { interim: this.transcript, isFinal: false };
  }

  getTranscript(): string {
    return this.transcript;
  }

  reset(): void {
    this.transcript = '';
  }
}

// ---------------------------------------------------------------------------
// STT Service — manages voice sessions and delegates to providers
// ---------------------------------------------------------------------------
class STTService {
  private activeSessions = new Map<string, VoiceSession>();
  private providers = new Map<string, STTProvider>();
  private sessionProviders = new Map<string, STTProvider>();
  private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Register the default browser provider
    this.registerProvider(new BrowserSTTProvider());
  }

  registerProvider(provider: STTProvider): void {
    this.providers.set(provider.name, provider);
  }

  async startSession(
    userId: string,
    entityId: string,
    config?: Partial<STTConfig>,
  ): Promise<VoiceSession> {
    const mergedConfig: STTConfig = { ...DEFAULT_STT_CONFIG, ...config };
    const providerName = mergedConfig.provider;

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`STT provider "${providerName}" is not registered`);
    }

    await provider.initialize(mergedConfig);

    const session: VoiceSession = {
      id: uuidv4(),
      userId,
      entityId,
      status: 'LISTENING',
      audioFormat: 'webm',
      sampleRate: 16000,
      startedAt: new Date(),
      transcript: '',
      confidence: undefined,
    };

    this.activeSessions.set(session.id, session);
    this.sessionProviders.set(session.id, provider);

    return session;
  }

  private checkSessionTimeout(session: VoiceSession): boolean {
    const elapsed = Date.now() - session.startedAt.getTime();
    return elapsed > this.SESSION_TIMEOUT_MS;
  }

  async processAudioChunk(
    sessionId: string,
    chunk: ArrayBuffer,
  ): Promise<{ interim: string; isFinal: boolean }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Voice session "${sessionId}" not found`);
    }

    // Auto-end session if it has exceeded the timeout
    if (this.checkSessionTimeout(session)) {
      const ended = await this.endSession(sessionId);
      return { interim: ended.transcript ?? '', isFinal: true };
    }

    const provider = this.sessionProviders.get(sessionId);
    if (!provider) {
      throw new Error(`No provider for session "${sessionId}"`);
    }

    const result = await provider.processChunk(chunk);
    session.transcript = result.interim;

    return result;
  }

  async endSession(sessionId: string): Promise<VoiceSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Voice session "${sessionId}" not found`);
    }

    const provider = this.sessionProviders.get(sessionId);

    session.status = 'COMPLETED';
    session.endedAt = new Date();
    session.transcript = provider?.getTranscript() ?? session.transcript ?? '';
    session.confidence = session.transcript ? 0.85 : 0;

    // AI-enhanced transcription post-processing
    if (session.transcript) {
      try {
        const enhanced = await generateText(
          `Clean up this voice transcription. Fix grammar, add proper punctuation, and correct obvious speech-to-text errors. Do NOT change the meaning or add content. Return ONLY the corrected text, nothing else.\n\nTranscription: "${session.transcript}"`,
          {
            maxTokens: 1024,
            temperature: 0.1,
            system: 'You are a transcription editor. Fix grammar and punctuation in speech-to-text output. Preserve the original meaning exactly.',
          },
        );
        if (enhanced && enhanced.length > 0) {
          session.transcript = enhanced;
          session.confidence = Math.min((session.confidence ?? 0.85) + 0.05, 1);
        }
      } catch {
        // AI enhancement failed — use raw transcript
      }
    }

    // Clean up provider state
    provider?.reset();
    this.sessionProviders.delete(sessionId);

    return session;
  }

  async getTranscript(sessionId: string): Promise<string> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Voice session "${sessionId}" not found`);
    }

    return session.transcript ?? '';
  }

  getSession(sessionId: string): VoiceSession | undefined {
    return this.activeSessions.get(sessionId);
  }
}

export const sttService = new STTService();
export { STTService, DEFAULT_STT_CONFIG };
