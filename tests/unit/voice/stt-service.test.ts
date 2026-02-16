// Mock AI client — must be before imports
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
  generateText: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

import { STTService } from '@/modules/voice/services/stt-service';

describe('STTService', () => {
  let sttService: STTService;

  beforeEach(() => {
    sttService = new STTService();
  });

  describe('startSession', () => {
    it('should create a new voice session with LISTENING status', async () => {
      const session = await sttService.startSession('user-1', 'entity-1');

      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-1');
      expect(session.entityId).toBe('entity-1');
      expect(session.status).toBe('LISTENING');
      expect(session.startedAt).toBeInstanceOf(Date);
    });

    it('should use default STT config when none provided', async () => {
      const session = await sttService.startSession('user-1', 'entity-1');

      expect(session.audioFormat).toBe('webm');
      expect(session.sampleRate).toBe(16000);
    });

    it('should store session in active sessions map', async () => {
      const session = await sttService.startSession('user-1', 'entity-1');

      const retrieved = sttService.getSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
    });
  });

  describe('processAudioChunk', () => {
    it('should process audio chunk and return interim text', async () => {
      const session = await sttService.startSession('user-1', 'entity-1');

      const encoder = new TextEncoder();
      const chunk = encoder.encode('Hello world');
      const result = await sttService.processAudioChunk(session.id, chunk.buffer as ArrayBuffer);

      expect(result.interim).toContain('Hello world');
    });

    it('should throw for non-existent session', async () => {
      const encoder = new TextEncoder();
      const chunk = encoder.encode('test');

      await expect(
        sttService.processAudioChunk('fake-id', chunk.buffer as ArrayBuffer),
      ).rejects.toThrow('Voice session "fake-id" not found');
    });
  });

  describe('endSession', () => {
    it('should update session status to COMPLETED', async () => {
      const session = await sttService.startSession('user-1', 'entity-1');
      const ended = await sttService.endSession(session.id);

      expect(ended.status).toBe('COMPLETED');
    });

    it('should set endedAt timestamp', async () => {
      const session = await sttService.startSession('user-1', 'entity-1');
      const ended = await sttService.endSession(session.id);

      expect(ended.endedAt).toBeInstanceOf(Date);
    });

    it('should return final transcript and confidence', async () => {
      const session = await sttService.startSession('user-1', 'entity-1');

      // Add some audio
      const encoder = new TextEncoder();
      await sttService.processAudioChunk(
        session.id,
        encoder.encode('Test transcript').buffer as ArrayBuffer,
      );

      const ended = await sttService.endSession(session.id);

      expect(ended.transcript).toBe('Test transcript');
      expect(ended.confidence).toBeGreaterThan(0);
    });

    it('should throw for non-existent session', async () => {
      await expect(sttService.endSession('fake-id')).rejects.toThrow(
        'Voice session "fake-id" not found',
      );
    });
  });

  describe('getTranscript', () => {
    it('should return current transcript for active session', async () => {
      const session = await sttService.startSession('user-1', 'entity-1');
      const transcript = await sttService.getTranscript(session.id);

      expect(typeof transcript).toBe('string');
    });

    it('should throw for non-existent session', async () => {
      await expect(sttService.getTranscript('fake-id')).rejects.toThrow(
        'Voice session "fake-id" not found',
      );
    });
  });
});
