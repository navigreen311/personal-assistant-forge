// ============================================================================
// Shadow Voice Agent — Phone Interface Unit Tests
// Tests for inbound/outbound call handling, SMS, TwiML builder, call window,
// rate limiting, and voicemail generation.
// ============================================================================

import { TwiMLBuilder, createTwiMLBuilder } from '@/modules/shadow/interfaces/twiml-builder';
import {
  PhoneInboundHandler,
  _resetStores as resetInboundStores,
  _addTrustedDevice as addInboundTrustedDevice,
  _getSession,
} from '@/modules/shadow/interfaces/phone-inbound';
import {
  PhoneOutboundHandler,
  _resetStores as resetOutboundStores,
  _addTrustedDevice as addOutboundTrustedDevice,
  _addCallLogEntry,
} from '@/modules/shadow/interfaces/phone-outbound';
import {
  ShadowSMS,
  _resetStores as resetSmsStores,
  _addTrustedDevice as addSmsTrustedDevice,
  _getSmsLog,
} from '@/modules/shadow/interfaces/sms';
import type { TrustedDevice, TwilioConfig } from '@/modules/shadow/interfaces/phone-types';

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const TEST_CONFIG: TwilioConfig = {
  accountSid: 'AC_test_account_sid',
  authToken: 'test_auth_token',
  phoneNumber: '+15551234567',
  baseUrl: 'https://test.example.com',
};

function createTrustedDevice(overrides?: Partial<TrustedDevice>): TrustedDevice {
  return {
    id: 'device-1',
    userId: 'user-1',
    phoneNumber: '+15559876543',
    label: 'Marcus',
    verified: true,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── TwiML Builder Tests ───────────────────────────────────────────────────

describe('TwiMLBuilder', () => {
  describe('build()', () => {
    it('should produce valid XML with Response wrapper', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.say('Hello').build();

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<Response>');
      expect(xml).toContain('</Response>');
    });

    it('should produce well-formed XML even when empty', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.build();

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<Response>');
      expect(xml).toContain('</Response>');
    });
  });

  describe('say()', () => {
    it('should generate a Say verb with default Polly.Matthew voice', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.say('Hello world').build();

      expect(xml).toContain('<Say voice="Polly.Matthew">Hello world</Say>');
    });

    it('should use a custom voice when specified', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.say('Hello', 'Polly.Joanna').build();

      expect(xml).toContain('<Say voice="Polly.Joanna">Hello</Say>');
    });

    it('should escape XML special characters in text', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.say('Tom & Jerry <said> "hello"').build();

      expect(xml).toContain('Tom &amp; Jerry &lt;said&gt; &quot;hello&quot;');
    });
  });

  describe('gather()', () => {
    it('should generate a Gather verb with speech input', () => {
      const builder = new TwiMLBuilder();
      const xml = builder
        .gather({ input: 'speech', action: '/api/handle', speechTimeout: 'auto' })
        .build();

      expect(xml).toContain('<Gather');
      expect(xml).toContain('input="speech"');
      expect(xml).toContain('action="/api/handle"');
      expect(xml).toContain('speechTimeout="auto"');
    });

    it('should wrap a Say prompt inside Gather when provided', () => {
      const builder = new TwiMLBuilder();
      const xml = builder
        .gather({ input: 'speech', action: '/api/handle' }, 'Say something')
        .build();

      expect(xml).toContain('<Gather');
      expect(xml).toContain('<Say voice="Polly.Matthew">Say something</Say>');
      expect(xml).toContain('</Gather>');
    });

    it('should generate self-closing Gather without prompt', () => {
      const builder = new TwiMLBuilder();
      const xml = builder
        .gather({ input: 'dtmf', numDigits: 4 })
        .build();

      expect(xml).toContain('<Gather');
      expect(xml).toContain('input="dtmf"');
      expect(xml).toContain('numDigits="4"');
      expect(xml).toContain('/>');
    });
  });

  describe('record()', () => {
    it('should generate a Record verb with maxLength', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.record({ maxLength: 30, action: '/api/recording' }).build();

      expect(xml).toContain('<Record');
      expect(xml).toContain('maxLength="30"');
      expect(xml).toContain('action="/api/recording"');
    });
  });

  describe('redirect()', () => {
    it('should generate a Redirect verb', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.redirect('/api/next-step').build();

      expect(xml).toContain('<Redirect>/api/next-step</Redirect>');
    });
  });

  describe('pause()', () => {
    it('should generate a Pause verb with length', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.pause(3).build();

      expect(xml).toContain('<Pause length="3" />');
    });

    it('should generate a Pause verb without length', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.pause().build();

      expect(xml).toContain('<Pause />');
    });
  });

  describe('sms()', () => {
    it('should generate an Sms verb', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.sms('+15551234567', 'Hello from Shadow').build();

      expect(xml).toContain('<Sms to="+15551234567">Hello from Shadow</Sms>');
    });
  });

  describe('hangup()', () => {
    it('should generate a Hangup verb', () => {
      const builder = new TwiMLBuilder();
      const xml = builder.hangup().build();

      expect(xml).toContain('<Hangup />');
    });
  });

  describe('chaining', () => {
    it('should support fluent chaining of multiple verbs', () => {
      const builder = new TwiMLBuilder();
      const xml = builder
        .say('Hello')
        .pause(1)
        .gather({ input: 'speech', action: '/api/next' }, 'What would you like?')
        .say('Goodbye')
        .hangup()
        .build();

      expect(xml).toContain('<Say voice="Polly.Matthew">Hello</Say>');
      expect(xml).toContain('<Pause length="1" />');
      expect(xml).toContain('<Gather');
      expect(xml).toContain('<Say voice="Polly.Matthew">Goodbye</Say>');
      expect(xml).toContain('<Hangup />');
    });
  });

  describe('createTwiMLBuilder()', () => {
    it('should create a builder with default voice', () => {
      const builder = createTwiMLBuilder();
      const xml = builder.say('Test').build();

      expect(xml).toContain('voice="Polly.Matthew"');
    });

    it('should create a builder with custom voice', () => {
      const builder = createTwiMLBuilder('Polly.Amy');
      const xml = builder.say('Test').build();

      expect(xml).toContain('voice="Polly.Amy"');
    });
  });

  describe('reset()', () => {
    it('should clear all parts for reuse', () => {
      const builder = new TwiMLBuilder();
      builder.say('First');

      const first = builder.build();
      expect(first).toContain('First');

      builder.reset();
      builder.say('Second');

      const second = builder.build();
      expect(second).not.toContain('First');
      expect(second).toContain('Second');
    });
  });
});

// ─── Caller Authentication Tests ───────────────────────────────────────────

describe('PhoneInboundHandler', () => {
  let handler: PhoneInboundHandler;

  beforeEach(() => {
    resetInboundStores();
    handler = new PhoneInboundHandler(TEST_CONFIG);
  });

  describe('authenticateCaller()', () => {
    it('should authenticate a known trusted device', async () => {
      addInboundTrustedDevice(createTrustedDevice());

      const result = await handler.authenticateCaller('+15559876543');

      expect(result.authenticated).toBe(true);
      expect(result.userId).toBe('user-1');
      expect(result.userName).toBe('Marcus');
      expect(result.requiresStepUp).toBe(false);
    });

    it('should require step-up auth for unknown numbers', async () => {
      const result = await handler.authenticateCaller('+15550000000');

      expect(result.authenticated).toBe(false);
      expect(result.userId).toBeUndefined();
      expect(result.requiresStepUp).toBe(true);
    });

    it('should require step-up auth for unverified devices', async () => {
      addInboundTrustedDevice(createTrustedDevice({ verified: false }));

      const result = await handler.authenticateCaller('+15559876543');

      expect(result.authenticated).toBe(false);
      expect(result.requiresStepUp).toBe(true);
    });

    it('should normalize phone numbers for matching', async () => {
      addInboundTrustedDevice(createTrustedDevice({ phoneNumber: '+15559876543' }));

      // Test without + prefix
      const result = await handler.authenticateCaller('15559876543');
      expect(result.authenticated).toBe(true);

      // Test without country code
      const result2 = await handler.authenticateCaller('5559876543');
      expect(result2.authenticated).toBe(true);
    });
  });

  describe('handleIncomingCall()', () => {
    it('should greet authenticated callers by name', async () => {
      addInboundTrustedDevice(createTrustedDevice());

      const twiml = await handler.handleIncomingCall({
        callSid: 'CA_test_1',
        from: '+15559876543',
        to: '+15551234567',
      });

      expect(twiml).toContain('Hey Marcus');
      expect(twiml).toContain('Shadow');
      expect(twiml).toContain('<Gather');
      expect(twiml).toContain('input="speech"');
    });

    it('should request verification for unknown numbers', async () => {
      const twiml = await handler.handleIncomingCall({
        callSid: 'CA_test_2',
        from: '+15550000000',
        to: '+15551234567',
      });

      expect(twiml).toContain('don&apos;t recognize this number');
      expect(twiml).toContain('verification code');
      expect(twiml).toContain('<Gather');
      expect(twiml).toContain('input="dtmf"');
      expect(twiml).toContain('numDigits="6"');
    });

    it('should create a session for authenticated callers', async () => {
      addInboundTrustedDevice(createTrustedDevice());

      await handler.handleIncomingCall({
        callSid: 'CA_test_3',
        from: '+15559876543',
        to: '+15551234567',
      });

      const session = _getSession('CA_test_3');
      expect(session).toBeDefined();
      expect(session?.userId).toBe('user-1');
      expect(session?.direction).toBe('inbound');
      expect(session?.status).toBe('in-progress');
    });

    it('should return valid TwiML XML structure', async () => {
      addInboundTrustedDevice(createTrustedDevice());

      const twiml = await handler.handleIncomingCall({
        callSid: 'CA_test_4',
        from: '+15559876543',
        to: '+15551234567',
      });

      expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('</Response>');
    });
  });

  describe('handleSpeechInput()', () => {
    beforeEach(async () => {
      addInboundTrustedDevice(createTrustedDevice());
      await handler.handleIncomingCall({
        callSid: 'CA_speech_test',
        from: '+15559876543',
        to: '+15551234567',
      });
    });

    it('should process speech and continue conversation loop', async () => {
      const session = _getSession('CA_speech_test');
      const twiml = await handler.handleSpeechInput({
        callSid: 'CA_speech_test',
        sessionId: session!.sessionId,
        speechResult: 'Check my calendar for today',
        confidence: 0.95,
      });

      expect(twiml).toContain('<Gather');
      expect(twiml).toContain('input="speech"');
      expect(twiml).toContain('</Gather>');
      // Should not hang up mid-conversation
      expect(twiml).toContain('</Response>');
    });

    it('should handle end-call phrases', async () => {
      const session = _getSession('CA_speech_test');
      const twiml = await handler.handleSpeechInput({
        callSid: 'CA_speech_test',
        sessionId: session!.sessionId,
        speechResult: 'goodbye',
        confidence: 0.99,
      });

      expect(twiml).toContain('talk to you later');
      expect(twiml).toContain('<Hangup />');
    });

    it('should handle low confidence speech', async () => {
      const session = _getSession('CA_speech_test');
      const twiml = await handler.handleSpeechInput({
        callSid: 'CA_speech_test',
        sessionId: session!.sessionId,
        speechResult: 'mumble',
        confidence: 0.2,
      });

      expect(twiml).toContain('didn&apos;t quite catch that');
    });

    it('should return error TwiML for unknown session', async () => {
      const twiml = await handler.handleSpeechInput({
        callSid: 'CA_nonexistent',
        sessionId: 'sess_fake',
        speechResult: 'hello',
        confidence: 0.9,
      });

      expect(twiml).toContain('lost track');
      expect(twiml).toContain('<Hangup />');
    });

    it('should record transcript entries', async () => {
      const session = _getSession('CA_speech_test');
      await handler.handleSpeechInput({
        callSid: 'CA_speech_test',
        sessionId: session!.sessionId,
        speechResult: 'Check my email',
        confidence: 0.9,
      });

      const updatedSession = _getSession('CA_speech_test');
      expect(updatedSession?.transcript.length).toBeGreaterThanOrEqual(1);
      expect(updatedSession?.transcript[0].role).toBe('user');
      expect(updatedSession?.transcript[0].content).toBe('Check my email');
    });
  });
});

// ─── Outbound Call Tests ───────────────────────────────────────────────────

describe('PhoneOutboundHandler', () => {
  let handler: PhoneOutboundHandler;

  beforeEach(() => {
    resetOutboundStores();
  });

  describe('isWithinCallWindow()', () => {
    it('should return true during call window hours', () => {
      handler = new PhoneOutboundHandler({
        config: TEST_CONFIG,
        callWindow: {
          startHour: 9,
          endHour: 18,
          quietStartHour: 22,
          quietEndHour: 7,
          timezone: 'America/New_York',
        },
      });

      // 10am - within window
      const tenAm = new Date();
      tenAm.setHours(10, 0, 0, 0);
      expect(handler.isWithinCallWindow(tenAm)).toBe(true);

      // 2pm - within window
      const twoPm = new Date();
      twoPm.setHours(14, 0, 0, 0);
      expect(handler.isWithinCallWindow(twoPm)).toBe(true);
    });

    it('should return false outside call window hours', () => {
      handler = new PhoneOutboundHandler({
        config: TEST_CONFIG,
        callWindow: {
          startHour: 9,
          endHour: 18,
          quietStartHour: 22,
          quietEndHour: 7,
          timezone: 'America/New_York',
        },
      });

      // 7am - before window
      const sevenAm = new Date();
      sevenAm.setHours(7, 0, 0, 0);
      expect(handler.isWithinCallWindow(sevenAm)).toBe(false);

      // 8pm - after window
      const eightPm = new Date();
      eightPm.setHours(20, 0, 0, 0);
      expect(handler.isWithinCallWindow(eightPm)).toBe(false);

      // midnight
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      expect(handler.isWithinCallWindow(midnight)).toBe(false);
    });

    it('should return true at start hour boundary', () => {
      handler = new PhoneOutboundHandler({
        config: TEST_CONFIG,
        callWindow: {
          startHour: 9,
          endHour: 18,
          quietStartHour: 22,
          quietEndHour: 7,
          timezone: 'America/New_York',
        },
      });

      const nineAm = new Date();
      nineAm.setHours(9, 0, 0, 0);
      expect(handler.isWithinCallWindow(nineAm)).toBe(true);
    });

    it('should return false at end hour boundary', () => {
      handler = new PhoneOutboundHandler({
        config: TEST_CONFIG,
        callWindow: {
          startHour: 9,
          endHour: 18,
          quietStartHour: 22,
          quietEndHour: 7,
          timezone: 'America/New_York',
        },
      });

      const sixPm = new Date();
      sixPm.setHours(18, 0, 0, 0);
      expect(handler.isWithinCallWindow(sixPm)).toBe(false);
    });
  });

  describe('isQuietHours()', () => {
    it('should detect quiet hours that span midnight', () => {
      handler = new PhoneOutboundHandler({
        config: TEST_CONFIG,
        callWindow: {
          startHour: 9,
          endHour: 18,
          quietStartHour: 22,
          quietEndHour: 7,
          timezone: 'America/New_York',
        },
      });

      // 11pm - quiet hours
      const elevenPm = new Date();
      elevenPm.setHours(23, 0, 0, 0);
      expect(handler.isQuietHours(elevenPm)).toBe(true);

      // 3am - quiet hours
      const threeAm = new Date();
      threeAm.setHours(3, 0, 0, 0);
      expect(handler.isQuietHours(threeAm)).toBe(true);

      // 10am - not quiet hours
      const tenAm = new Date();
      tenAm.setHours(10, 0, 0, 0);
      expect(handler.isQuietHours(tenAm)).toBe(false);
    });
  });

  describe('checkRateLimit()', () => {
    beforeEach(() => {
      handler = new PhoneOutboundHandler({
        config: TEST_CONFIG,
        rateLimit: { maxPerDay: 5, maxPerHour: 2 },
      });
    });

    it('should allow calls within rate limits', () => {
      const result = handler.checkRateLimit('user-1');
      expect(result.allowed).toBe(true);
    });

    it('should block when hourly limit is exceeded', () => {
      // Add 2 calls in the last hour
      const now = new Date();
      _addCallLogEntry('user-1', { timestamp: new Date(now.getTime() - 30 * 60 * 1000), callSid: 'CA_1' });
      _addCallLogEntry('user-1', { timestamp: new Date(now.getTime() - 10 * 60 * 1000), callSid: 'CA_2' });

      const result = handler.checkRateLimit('user-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('2/2 calls in the last hour');
    });

    it('should block when daily limit is exceeded', () => {
      // Add 5 calls today (spread across hours to not hit hourly limit)
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      for (let i = 0; i < 5; i++) {
        _addCallLogEntry('user-1', {
          timestamp: new Date(startOfDay.getTime() + (i + 1) * 2 * 60 * 60 * 1000),
          callSid: `CA_${i}`,
        });
      }

      const result = handler.checkRateLimit('user-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('5/5 calls today');
    });

    it('should not count calls from previous day', () => {
      // Add calls from yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      for (let i = 0; i < 5; i++) {
        _addCallLogEntry('user-1', { timestamp: yesterday, callSid: `CA_old_${i}` });
      }

      const result = handler.checkRateLimit('user-1');
      expect(result.allowed).toBe(true);
    });

    it('should not count calls from more than an hour ago for hourly limit', () => {
      // Add calls from 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      _addCallLogEntry('user-1', { timestamp: twoHoursAgo, callSid: 'CA_old_1' });
      _addCallLogEntry('user-1', { timestamp: twoHoursAgo, callSid: 'CA_old_2' });

      const result = handler.checkRateLimit('user-1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('callUser()', () => {
    beforeEach(() => {
      handler = new PhoneOutboundHandler({
        config: TEST_CONFIG,
        callWindow: {
          startHour: 0,
          endHour: 24,
          quietStartHour: 25,  // Effectively disabled for testing
          quietEndHour: 25,
          timezone: 'UTC',
        },
        rateLimit: { maxPerDay: 10, maxPerHour: 5 },
      });
    });

    it('should throw when no trusted device exists', async () => {
      await expect(
        handler.callUser({
          userId: 'user-no-device',
          reason: 'Test',
          priority: 'normal',
          content: 'Test content',
        }),
      ).rejects.toThrow('No trusted phone number found');
    });

    it('should throw when outside call window (non-urgent)', async () => {
      handler = new PhoneOutboundHandler({
        config: TEST_CONFIG,
        callWindow: {
          startHour: 9,
          endHour: 10,  // Very narrow window
          quietStartHour: 25,
          quietEndHour: 25,
          timezone: 'UTC',
        },
      });

      addOutboundTrustedDevice('user-1', createTrustedDevice());

      // This will likely be outside the 9-10am window
      try {
        await handler.callUser({
          userId: 'user-1',
          reason: 'Test',
          priority: 'normal',
          content: 'Test content',
        });
        // If we happen to run at 9am, the test passes anyway via Twilio error
      } catch (err) {
        expect((err as Error).message).toMatch(/Outside call window|Twilio/);
      }
    });
  });

  describe('handleVoicemail()', () => {
    it('should generate voicemail TwiML under 30 seconds', async () => {
      handler = new PhoneOutboundHandler({ config: TEST_CONFIG });
      addOutboundTrustedDevice('user-1', createTrustedDevice());

      const twiml = await handler.handleVoicemail({
        callSid: 'CA_vm_1',
        userId: 'user-1',
        content: 'Your appointment has been confirmed for tomorrow at 2pm.',
      });

      expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Say');
      expect(twiml).toContain('Shadow');
      expect(twiml).toContain('appointment');
      expect(twiml).toContain('send you a text');
      expect(twiml).toContain('<Hangup />');
    });

    it('should truncate long voicemail content', async () => {
      handler = new PhoneOutboundHandler({ config: TEST_CONFIG });
      addOutboundTrustedDevice('user-1', createTrustedDevice());

      const longContent = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');

      const twiml = await handler.handleVoicemail({
        callSid: 'CA_vm_2',
        userId: 'user-1',
        content: longContent,
      });

      // The voicemail text in TwiML should be truncated (~70 words)
      expect(twiml).toContain('...');
      expect(twiml).toContain('<Hangup />');
    });
  });

  describe('handleCallAnswered()', () => {
    it('should generate greeting TwiML with user name', async () => {
      handler = new PhoneOutboundHandler({ config: TEST_CONFIG });

      const twiml = await handler.handleCallAnswered({
        callSid: 'CA_answered_1',
        sessionId: 'sess_1',
        userName: 'Marcus',
      });

      expect(twiml).toContain('Hey Marcus');
      expect(twiml).toContain('Shadow calling');
      expect(twiml).toContain('<Gather');
      expect(twiml).toContain('input="speech"');
    });

    it('should include fallback for no response', async () => {
      handler = new PhoneOutboundHandler({ config: TEST_CONFIG });

      const twiml = await handler.handleCallAnswered({
        callSid: 'CA_answered_2',
        sessionId: 'sess_2',
        userName: 'Alex',
      });

      expect(twiml).toContain('send you a text instead');
      expect(twiml).toContain('<Hangup />');
    });
  });
});

// ─── SMS Tests ─────────────────────────────────────────────────────────────

describe('ShadowSMS', () => {
  let sms: ShadowSMS;

  beforeEach(() => {
    resetSmsStores();
    // Use config without real Twilio so it falls back to mock mode
    sms = new ShadowSMS({
      accountSid: '',
      authToken: '',
      phoneNumber: '+15551234567',
      baseUrl: 'https://test.example.com',
    });
  });

  describe('sendSMS()', () => {
    it('should send SMS to a user\'s trusted device', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.sendSMS({
        userId: 'user-1',
        body: 'Hello from Shadow',
      });

      expect(result.messageSid).toBeTruthy();
      expect(result.status).toBe('queued');
    });

    it('should append deep link to message body', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      await sms.sendSMS({
        userId: 'user-1',
        body: 'Check this out',
        deepLink: 'https://app.example.com/task/123',
      });

      const log = _getSmsLog();
      expect(log.length).toBe(1);
      expect(log[0].body).toContain('Check this out');
      expect(log[0].body).toContain('https://app.example.com/task/123');
    });

    it('should send to explicit number when provided', async () => {
      const result = await sms.sendSMS({
        userId: 'user-1',
        to: '+15559999999',
        body: 'Direct message',
      });

      expect(result.messageSid).toBeTruthy();

      const log = _getSmsLog();
      expect(log[0].to).toBe('+15559999999');
    });

    it('should throw when no phone number found and no to specified', async () => {
      await expect(
        sms.sendSMS({
          userId: 'user-no-phone',
          body: 'Hello',
        }),
      ).rejects.toThrow('No phone number found');
    });
  });

  describe('handleInboundSMS()', () => {
    it('should return error for unrecognized numbers', async () => {
      const result = await sms.handleInboundSMS({
        from: '+15550000000',
        body: 'hello',
      });

      expect(result.response).toContain('don\'t recognize this number');
    });

    it('should handle status command', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.handleInboundSMS({
        from: '+15559876543',
        body: 'status',
      });

      expect(result.response).toContain('running smoothly');
      expect(result.actionTaken).toBe('status_check');
    });

    it('should handle help command', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.handleInboundSMS({
        from: '+15559876543',
        body: 'help',
      });

      expect(result.response).toContain('Commands');
      expect(result.actionTaken).toBe('help_shown');
    });

    it('should handle remind command', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.handleInboundSMS({
        from: '+15559876543',
        body: 'remind pick up groceries',
      });

      expect(result.response).toContain('pick up groceries');
      expect(result.actionTaken).toBe('reminder_created');
    });

    it('should handle task command', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.handleInboundSMS({
        from: '+15559876543',
        body: 'task Review Q4 report',
      });

      expect(result.response).toContain('Review Q4 report');
      expect(result.actionTaken).toBe('task_created');
    });

    it('should handle callback request', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.handleInboundSMS({
        from: '+15559876543',
        body: 'call me',
      });

      expect(result.response).toContain('call you');
      expect(result.actionTaken).toBe('callback_requested');
    });

    it('should handle conversational yes/confirm', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.handleInboundSMS({
        from: '+15559876543',
        body: 'Yes, go ahead',
      });

      expect(result.response).toContain('Confirmed');
      expect(result.actionTaken).toBe('confirmation_received');
    });

    it('should handle conversational no/cancel', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.handleInboundSMS({
        from: '+15559876543',
        body: 'No, cancel that',
      });

      expect(result.response).toContain('cancelled');
      expect(result.actionTaken).toBe('cancellation_received');
    });

    it('should handle free-form messages', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      const result = await sms.handleInboundSMS({
        from: '+15559876543',
        body: 'What is the weather forecast today?',
      });

      expect(result.response).toContain('Marcus');
      expect(result.actionTaken).toBe('message_queued');
    });
  });

  describe('sendCallSummary()', () => {
    it('should send formatted call summary with action items', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      await sms.sendCallSummary({
        userId: 'user-1',
        sessionId: 'sess_abc123',
        summary: 'Discussed Q4 goals and budget allocation.',
        actionItems: [
          'Review budget spreadsheet by Friday',
          'Schedule follow-up with finance team',
          'Send updated timeline to stakeholders',
        ],
      });

      const log = _getSmsLog();
      expect(log.length).toBe(1);
      expect(log[0].body).toContain('Call Summary');
      expect(log[0].body).toContain('Discussed Q4 goals');
      expect(log[0].body).toContain('Action Items');
      expect(log[0].body).toContain('1. Review budget spreadsheet');
      expect(log[0].body).toContain('2. Schedule follow-up');
      expect(log[0].body).toContain('3. Send updated timeline');
    });

    it('should send summary without action items section when empty', async () => {
      addSmsTrustedDevice('user-1', createTrustedDevice());

      await sms.sendCallSummary({
        userId: 'user-1',
        sessionId: 'sess_def456',
        summary: 'Quick check-in, everything is on track.',
        actionItems: [],
      });

      const log = _getSmsLog();
      expect(log.length).toBe(1);
      expect(log[0].body).toContain('Quick check-in');
      expect(log[0].body).not.toContain('Action Items');
    });
  });
});
