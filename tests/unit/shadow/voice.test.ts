// ============================================================================
// Shadow Voice Agent — Unit Tests
// Tests for barge-in detection, voice form-fill, date/amount parsing,
// and STT/TTS failover logic.
// ============================================================================

import { BargeInHandler } from '@/modules/shadow/interfaces/barge-in-handler';
import { VoiceFormFill } from '@/modules/shadow/interfaces/voice-form-fill';
import { VoiceInAppHandler } from '@/modules/shadow/interfaces/voice-in-app';

// ---------------------------------------------------------------------------
// Mock fetch globally for STT/TTS failover tests
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  global.fetch = jest.fn(handler) as jest.Mock;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  // Clean up env vars
  delete process.env.OPENAI_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.GOOGLE_TTS_API_KEY;
});

// ===========================================================================
// BargeInHandler Tests
// ===========================================================================

describe('BargeInHandler', () => {
  let handler: BargeInHandler;

  beforeEach(() => {
    handler = new BargeInHandler();
  });

  // -------------------------------------------------------------------------
  // Voice Activity Detection
  // -------------------------------------------------------------------------

  describe('detectVoiceActivity', () => {
    it('should detect silence when audio level is below threshold', () => {
      const result = handler.detectVoiceActivity(0.05);
      expect(result.isSpeaking).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should detect speaking when audio level is above threshold', () => {
      const result = handler.detectVoiceActivity(0.5);
      expect(result.isSpeaking).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return full confidence at maximum audio level', () => {
      const result = handler.detectVoiceActivity(1.0);
      expect(result.isSpeaking).toBe(true);
      expect(result.confidence).toBe(1);
    });

    it('should respect custom threshold', () => {
      const result = handler.detectVoiceActivity(0.3, 0.5);
      expect(result.isSpeaking).toBe(false);

      const result2 = handler.detectVoiceActivity(0.6, 0.5);
      expect(result2.isSpeaking).toBe(true);
    });

    it('should clamp audio level to 0-1 range', () => {
      const result = handler.detectVoiceActivity(1.5);
      expect(result.isSpeaking).toBe(true);
      expect(result.confidence).toBeLessThanOrEqual(1);

      const result2 = handler.detectVoiceActivity(-0.5);
      expect(result2.isSpeaking).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Pause Command Detection
  // -------------------------------------------------------------------------

  describe('detectPauseCommand', () => {
    it.each([
      ['pause', true],
      ['hold on', true],
      ['give me a second', true],
      ['one moment', true],
      ['wait', true],
      ['hang on', true],
      ['just a sec', true],
      ['stop', true],
      ['hold that thought', true],
      ['one sec', true],
      ['PAUSE', true], // case insensitive
      ['Hold On please', true],
      ['can you pause for a sec', true],
    ])('should detect "%s" as pause command: %s', (transcript, expected) => {
      expect(handler.detectPauseCommand(transcript)).toBe(expected);
    });

    it.each([
      ['hello there', false],
      ['continue working', false],
      ['what time is it', false],
      ['go ahead', false],
    ])('should NOT detect "%s" as pause command', (transcript) => {
      expect(handler.detectPauseCommand(transcript)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Resume Signal Detection
  // -------------------------------------------------------------------------

  describe('detectResumeSignal', () => {
    it.each([
      ['continue', true],
      ['go ahead', true],
      ["i'm ready", true],
      ['im ready', true],
      ['resume', true],
      ['keep going', true],
      ['go on', true],
      ['carry on', true],
      ['okay', true],
      ['yes', true],
      ['yeah', true],
      ['proceed', true],
      ['CONTINUE', true], // case insensitive
      ['ok go', true],
    ])('should detect "%s" as resume signal: %s', (transcript, expected) => {
      expect(handler.detectResumeSignal(transcript)).toBe(expected);
    });

    it.each([
      ['hello', false],
      ['pause', false],
      ['stop', false],
      ['what was that', false],
    ])('should NOT detect "%s" as resume signal', (transcript) => {
      expect(handler.detectResumeSignal(transcript)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Barge-In Handling
  // -------------------------------------------------------------------------

  describe('handleBargeIn', () => {
    it('should stop and acknowledge on standard barge-in', async () => {
      const result = await handler.handleBargeIn({
        sessionId: 'session-1',
        transcript: 'Actually, I meant something else',
        currentResponseId: 'resp-1',
      });

      expect(result.shouldStop).toBe(true);
      expect(result.acknowledgment).toBeTruthy();
      expect(result.acknowledgment.length).toBeGreaterThan(0);
    });

    it('should handle pause command during barge-in', async () => {
      const result = await handler.handleBargeIn({
        sessionId: 'session-1',
        transcript: 'hold on a second',
        currentResponseId: 'resp-1',
      });

      expect(result.shouldStop).toBe(true);
      expect(result.acknowledgment).toContain('take your time');
    });

    it('should handle resume signal after pause', async () => {
      // First, pause the session
      await handler.handleBargeIn({
        sessionId: 'session-2',
        transcript: 'pause',
        currentResponseId: 'resp-1',
      });

      // Then resume
      const result = await handler.handleBargeIn({
        sessionId: 'session-2',
        transcript: 'continue',
        currentResponseId: 'resp-2',
      });

      expect(result.shouldStop).toBe(false);
      expect(result.acknowledgment).toContain('Welcome back');
    });

    it('should rotate acknowledgment phrases', async () => {
      const acks: string[] = [];
      for (let i = 0; i < 10; i++) {
        const result = await handler.handleBargeIn({
          sessionId: `session-ack-${i}`,
          transcript: 'actually',
          currentResponseId: `resp-${i}`,
        });
        acks.push(result.acknowledgment);
      }

      // Should have variety (not all the same)
      const unique = new Set(acks);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // Idle Detection
  // -------------------------------------------------------------------------

  describe('checkIdlePrompt', () => {
    it('should not prompt immediately', () => {
      handler.getSessionState('session-idle'); // Initialize
      const prompt = handler.checkIdlePrompt('session-idle');
      expect(prompt).toBeNull();
    });

    it('should prompt after idle period', () => {
      const state = handler.getSessionState('session-idle-2');
      // Simulate 3 minutes of inactivity
      state.lastActivityAt = Date.now() - 3 * 60 * 1000;

      const prompt = handler.checkIdlePrompt('session-idle-2');
      expect(prompt).toBe('Still there? Want to continue or pause for later?');
    });
  });

  // -------------------------------------------------------------------------
  // Session Cleanup
  // -------------------------------------------------------------------------

  describe('session management', () => {
    it('should track session count', () => {
      handler.getSessionState('s1');
      handler.getSessionState('s2');
      expect(handler.activeSessionCount).toBe(2);
    });

    it('should clear session state', () => {
      handler.getSessionState('s-clear');
      expect(handler.activeSessionCount).toBeGreaterThanOrEqual(1);
      handler.clearSession('s-clear');
      // Session should be removed
      const state = handler.getSessionState('s-clear');
      expect(state.isPaused).toBe(false);
    });
  });
});

// ===========================================================================
// VoiceFormFill Tests
// ===========================================================================

describe('VoiceFormFill', () => {
  let formFill: VoiceFormFill;

  beforeEach(() => {
    formFill = new VoiceFormFill();
  });

  // -------------------------------------------------------------------------
  // Natural Date Parsing
  // -------------------------------------------------------------------------

  describe('parseNaturalDate', () => {
    it('should parse "today"', () => {
      const result = formFill.parseNaturalDate('today');
      expect(result).not.toBeNull();
      const now = new Date();
      expect(result!.getFullYear()).toBe(now.getFullYear());
      expect(result!.getMonth()).toBe(now.getMonth());
      expect(result!.getDate()).toBe(now.getDate());
    });

    it('should parse "tomorrow"', () => {
      const result = formFill.parseNaturalDate('tomorrow');
      expect(result).not.toBeNull();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(result!.getDate()).toBe(tomorrow.getDate());
    });

    it('should parse "yesterday"', () => {
      const result = formFill.parseNaturalDate('yesterday');
      expect(result).not.toBeNull();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(result!.getDate()).toBe(yesterday.getDate());
    });

    it('should parse "next Tuesday"', () => {
      const result = formFill.parseNaturalDate('next Tuesday');
      expect(result).not.toBeNull();
      expect(result!.getDay()).toBe(2); // Tuesday = 2
      expect(result!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should parse "next Friday"', () => {
      const result = formFill.parseNaturalDate('next Friday');
      expect(result).not.toBeNull();
      expect(result!.getDay()).toBe(5); // Friday = 5
    });

    it('should parse "March 15th"', () => {
      const result = formFill.parseNaturalDate('March 15th');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(2); // March = 2
      expect(result!.getDate()).toBe(15);
    });

    it('should parse "March 15"', () => {
      const result = formFill.parseNaturalDate('March 15');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(2);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse "Jan 1st, 2026"', () => {
      const result = formFill.parseNaturalDate('Jan 1st, 2026');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(1);
      expect(result!.getFullYear()).toBe(2026);
    });

    it('should parse "December 25"', () => {
      const result = formFill.parseNaturalDate('December 25');
      expect(result).not.toBeNull();
      expect(result!.getMonth()).toBe(11);
      expect(result!.getDate()).toBe(25);
    });

    it('should parse just a day name like "Wednesday"', () => {
      const result = formFill.parseNaturalDate('Wednesday');
      expect(result).not.toBeNull();
      expect(result!.getDay()).toBe(3);
    });

    it('should parse "in 3 days"', () => {
      const result = formFill.parseNaturalDate('in 3 days');
      expect(result).not.toBeNull();
      const expected = new Date();
      expected.setDate(expected.getDate() + 3);
      expect(result!.getDate()).toBe(expected.getDate());
    });

    it('should parse "in 2 weeks"', () => {
      const result = formFill.parseNaturalDate('in 2 weeks');
      expect(result).not.toBeNull();
      const expected = new Date();
      expected.setDate(expected.getDate() + 14);
      expect(result!.getDate()).toBe(expected.getDate());
    });

    it('should parse "end of month"', () => {
      const result = formFill.parseNaturalDate('end of month');
      expect(result).not.toBeNull();
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      expect(result!.getDate()).toBe(lastDay);
    });

    it('should parse ISO format "2026-06-15"', () => {
      const result = formFill.parseNaturalDate('2026-06-15');
      expect(result).not.toBeNull();
      expect(result!.getFullYear()).toBe(2026);
      expect(result!.getMonth()).toBe(5); // June = 5
      expect(result!.getDate()).toBe(15);
    });

    it('should return null for unparseable input', () => {
      expect(formFill.parseNaturalDate('not a date')).toBeNull();
      expect(formFill.parseNaturalDate('')).toBeNull();
      expect(formFill.parseNaturalDate('asdf')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Amount Parsing
  // -------------------------------------------------------------------------

  describe('parseAmount', () => {
    it('should parse plain numbers', () => {
      expect(formFill.parseAmount('4200')).toBe(4200);
      expect(formFill.parseAmount('99.99')).toBe(99.99);
      expect(formFill.parseAmount('0')).toBe(0);
    });

    it('should parse with dollar sign', () => {
      expect(formFill.parseAmount('$4,200')).toBe(4200);
      expect(formFill.parseAmount('$99.99')).toBe(99.99);
      expect(formFill.parseAmount('$1,000,000')).toBe(1000000);
    });

    it('should parse shorthand notation', () => {
      expect(formFill.parseAmount('4.2k')).toBe(4200);
      expect(formFill.parseAmount('1.5m')).toBe(1500000);
      expect(formFill.parseAmount('2b')).toBe(2000000000);
      expect(formFill.parseAmount('$10k')).toBe(10000);
    });

    it('should parse word-based numbers', () => {
      expect(formFill.parseAmount('four thousand two hundred')).toBe(4200);
      expect(formFill.parseAmount('one hundred')).toBe(100);
      expect(formFill.parseAmount('twenty five')).toBe(25);
      expect(formFill.parseAmount('one thousand')).toBe(1000);
      expect(formFill.parseAmount('five hundred')).toBe(500);
    });

    it('should parse complex word numbers', () => {
      expect(formFill.parseAmount('three thousand five hundred')).toBe(3500);
      expect(formFill.parseAmount('ten thousand')).toBe(10000);
      expect(formFill.parseAmount('twelve hundred')).toBe(1200);
    });

    it('should parse mixed digit/word numbers', () => {
      expect(formFill.parseAmount('4 thousand 200')).toBe(4200);
      expect(formFill.parseAmount('4 thousand two hundred')).toBe(4200);
      expect(formFill.parseAmount('10 thousand')).toBe(10000);
    });

    it('should handle "zero"', () => {
      expect(formFill.parseAmount('zero')).toBe(0);
    });

    it('should return null for non-numeric input', () => {
      expect(formFill.parseAmount('hello')).toBeNull();
      expect(formFill.parseAmount('')).toBeNull();
      expect(formFill.parseAmount('not a number')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Entity Inference
  // -------------------------------------------------------------------------

  describe('inferEntity', () => {
    const contacts = ['John Smith', 'Alice Johnson', 'Bob Williams', 'Sarah O\'Brien'];

    it('should match exact name', () => {
      expect(formFill.inferEntity('John Smith', contacts)).toBe('John Smith');
    });

    it('should match case-insensitively', () => {
      expect(formFill.inferEntity('john smith', contacts)).toBe('John Smith');
    });

    it('should match by first name', () => {
      expect(formFill.inferEntity('send it to Alice', contacts)).toBe('Alice Johnson');
    });

    it('should match by last name', () => {
      expect(formFill.inferEntity('email Williams', contacts)).toBe('Bob Williams');
    });

    it('should return null for no match', () => {
      expect(formFill.inferEntity('someone else', contacts)).toBeNull();
    });

    it('should return null for empty contact list', () => {
      expect(formFill.inferEntity('John', [])).toBeNull();
    });

    it('should handle close misspellings via fuzzy matching', () => {
      // "Jhon" is Levenshtein distance 1 from "John"
      expect(formFill.inferEntity('Jhon', contacts)).toBe('John Smith');
    });
  });

  // -------------------------------------------------------------------------
  // Form Fill
  // -------------------------------------------------------------------------

  describe('fillForm', () => {
    it('should fill a date field from voice input', async () => {
      const result = await formFill.fillForm({
        formSchema: [
          { name: 'dueDate', type: 'date', required: true, label: 'Due Date' },
        ],
        voiceInput: 'set the due date to next Tuesday',
        context: {},
      });

      expect(result.filledFields.dueDate).toBeDefined();
      expect(result.missingFields).not.toContain('dueDate');
      expect(result.confidence.dueDate).toBeGreaterThan(0);
    });

    it('should fill a currency field from voice input', async () => {
      const result = await formFill.fillForm({
        formSchema: [
          { name: 'amount', type: 'currency', required: true, label: 'Amount' },
        ],
        voiceInput: 'the total is $4,200',
        context: {},
      });

      expect(result.filledFields.amount).toBe(4200);
      expect(result.confidence.amount).toBeGreaterThan(0);
    });

    it('should fill an email field', async () => {
      const result = await formFill.fillForm({
        formSchema: [
          { name: 'email', type: 'email', required: true, label: 'Email' },
        ],
        voiceInput: 'send it to john@example.com please',
        context: {},
      });

      expect(result.filledFields.email).toBe('john@example.com');
      expect(result.confidence.email).toBeGreaterThan(0.9);
    });

    it('should identify missing required fields and generate next question', async () => {
      const result = await formFill.fillForm({
        formSchema: [
          { name: 'title', type: 'text', required: true, label: 'Title' },
          { name: 'dueDate', type: 'date', required: true, label: 'Due Date' },
          { name: 'amount', type: 'currency', required: true, label: 'Amount' },
        ],
        voiceInput: 'create a new invoice',
        context: {},
      });

      // At minimum, dueDate and amount should be missing since the input
      // doesn't contain clear date or amount patterns
      expect(result.missingFields.length).toBeGreaterThan(0);
      expect(result.nextQuestion).toBeDefined();
      expect(result.nextQuestion!.length).toBeGreaterThan(0);
    });

    it('should infer contact name from context', async () => {
      const result = await formFill.fillForm({
        formSchema: [
          { name: 'recipient', type: 'text', required: true, label: 'Recipient' },
        ],
        voiceInput: 'send the invoice to Alice Johnson',
        context: {
          contacts: ['Alice Johnson', 'Bob Smith'],
        },
      });

      expect(result.filledFields.recipient).toBe('Alice Johnson');
    });

    it('should handle select fields', async () => {
      const result = await formFill.fillForm({
        formSchema: [
          {
            name: 'priority',
            type: 'select',
            required: true,
            label: 'Priority',
            options: ['High', 'Medium', 'Low'],
          },
        ],
        voiceInput: 'set priority to high',
        context: {},
      });

      expect(result.filledFields.priority).toBe('High');
    });
  });
});

// ===========================================================================
// VoiceInAppHandler — STT/TTS Failover Tests
// ===========================================================================

describe('VoiceInAppHandler', () => {
  let handler: VoiceInAppHandler;

  beforeEach(() => {
    handler = new VoiceInAppHandler();
  });

  // -------------------------------------------------------------------------
  // STT Failover
  // -------------------------------------------------------------------------

  describe('speechToText — failover chain', () => {
    it('should use Whisper when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';

      mockFetch(async (url) => {
        if (url.includes('openai.com')) {
          return new Response(
            JSON.stringify({
              text: 'Hello world',
              segments: [{ avg_logprob: -0.2 }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await handler.speechToText({
        audio: Buffer.from('fake-audio'),
        format: 'webm',
      });

      expect(result.transcript).toBe('Hello world');
      expect(result.confidence).toBeGreaterThan(0);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should fall back to Deepgram when Whisper fails', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';

      mockFetch(async (url) => {
        if (url.includes('openai.com')) {
          return new Response('Server Error', { status: 500 });
        }
        if (url.includes('deepgram.com')) {
          return new Response(
            JSON.stringify({
              results: {
                channels: [
                  {
                    alternatives: [
                      { transcript: 'Hello from Deepgram', confidence: 0.92 },
                    ],
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await handler.speechToText({
        audio: Buffer.from('fake-audio'),
        format: 'webm',
      });

      expect(result.transcript).toBe('Hello from Deepgram');
      expect(result.confidence).toBe(0.92);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return empty transcript when all STT providers fail', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.DEEPGRAM_API_KEY = 'test-key';

      mockFetch(async () => {
        return new Response('Server Error', { status: 500 });
      });

      const result = await handler.speechToText({
        audio: Buffer.from('fake-audio'),
        format: 'webm',
      });

      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
    });

    it('should return empty transcript for empty audio', async () => {
      const result = await handler.speechToText({
        audio: Buffer.alloc(0),
        format: 'webm',
      });

      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
    });

    it('should return empty transcript when no API keys are configured', async () => {
      // No env vars set
      const result = await handler.speechToText({
        audio: Buffer.from('fake-audio'),
        format: 'webm',
      });

      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // TTS Failover
  // -------------------------------------------------------------------------

  describe('textToSpeech — failover chain', () => {
    it('should use ElevenLabs when API key is set', async () => {
      process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';

      const fakeAudio = Buffer.from('fake-mp3-data');
      mockFetch(async (url) => {
        if (url.includes('elevenlabs.io')) {
          return new Response(fakeAudio, {
            status: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await handler.textToSpeech({ text: 'Hello' });

      expect(result.audio.length).toBeGreaterThan(0);
      expect(result.format).toBe('audio/mpeg');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should fall back to Google TTS when ElevenLabs fails', async () => {
      process.env.ELEVENLABS_API_KEY = 'test-key';
      process.env.GOOGLE_TTS_API_KEY = 'test-google-key';

      const fakeAudioBase64 = Buffer.from('fake-google-audio').toString('base64');
      mockFetch(async (url) => {
        if (url.includes('elevenlabs.io')) {
          return new Response('Rate limited', { status: 429 });
        }
        if (url.includes('texttospeech.googleapis.com')) {
          return new Response(
            JSON.stringify({ audioContent: fakeAudioBase64 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await handler.textToSpeech({ text: 'Hello' });

      expect(result.audio.length).toBeGreaterThan(0);
      expect(result.format).toBe('audio/mpeg');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return text-only fallback when all TTS providers fail', async () => {
      process.env.ELEVENLABS_API_KEY = 'test-key';
      process.env.GOOGLE_TTS_API_KEY = 'test-key';

      mockFetch(async () => {
        return new Response('Server Error', { status: 500 });
      });

      const result = await handler.textToSpeech({ text: 'Hello' });

      expect(result.audio.length).toBe(0);
      expect(result.format).toBe('text/plain');
      expect(result.durationMs).toBe(0);
    });

    it('should return text-only fallback when no API keys configured', async () => {
      const result = await handler.textToSpeech({ text: 'Hello' });

      expect(result.audio.length).toBe(0);
      expect(result.format).toBe('text/plain');
    });

    it('should throw on empty text', async () => {
      await expect(handler.textToSpeech({ text: '' })).rejects.toThrow('empty text');
      await expect(handler.textToSpeech({ text: '   ' })).rejects.toThrow('empty text');
    });
  });

  // -------------------------------------------------------------------------
  // processAudioInput — Full Pipeline
  // -------------------------------------------------------------------------

  describe('processAudioInput', () => {
    it('should return transcript and response for valid audio', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      mockFetch(async (url) => {
        if (url.includes('openai.com')) {
          return new Response(
            JSON.stringify({ text: 'Create a task for tomorrow', segments: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const result = await handler.processAudioInput({
        audioBuffer: Buffer.from('fake-audio-data'),
        sessionId: 'test-session',
        userId: 'user-1',
        format: 'webm',
      });

      expect(result.transcript).toBe('Create a task for tomorrow');
      expect(result.response).not.toBeNull();
      expect(result.response!.sessionId).toBe('test-session');
    });

    it('should return null response for empty transcript', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      mockFetch(async () => {
        return new Response(
          JSON.stringify({ text: '', segments: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      const result = await handler.processAudioInput({
        audioBuffer: Buffer.from('silence'),
        sessionId: 'test-session',
        userId: 'user-1',
      });

      expect(result.transcript).toBe('');
      expect(result.response).toBeNull();
    });
  });
});
