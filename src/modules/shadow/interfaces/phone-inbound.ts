// ============================================================================
// Shadow Voice Agent — Phone Inbound Handler
// Handles incoming Twilio calls: authentication, greeting, speech processing,
// and full conversation loop with SMS companion messages.
// ============================================================================

import { TwiMLBuilder } from './twiml-builder';
import type {
  CallerAuthResult,
  TrustedDevice,
  PhoneCallSession,
  TranscriptEntry,
  TwilioConfig,
} from './phone-types';
import { getTwilioConfig, isTwilioConfigured } from './phone-types';

// ─── In-Memory Stores (production: replace with DB/Redis) ──────────────────

const trustedDevices = new Map<string, TrustedDevice>();
const activeSessions = new Map<string, PhoneCallSession>();
const pendingVerificationCodes = new Map<string, { code: string; expiresAt: Date; userId: string }>();

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ─── Store Management (for testing) ────────────────────────────────────────

export function _resetStores(): void {
  trustedDevices.clear();
  activeSessions.clear();
  pendingVerificationCodes.clear();
  idCounter = 0;
}

export function _addTrustedDevice(device: TrustedDevice): void {
  const normalizedPhone = normalizePhoneNumber(device.phoneNumber);
  trustedDevices.set(normalizedPhone, { ...device, phoneNumber: normalizedPhone });
}

export function _getSession(callSid: string): PhoneCallSession | undefined {
  return activeSessions.get(callSid);
}

// ─── Phone Number Normalization ────────────────────────────────────────────

function normalizePhoneNumber(phone: string): string {
  // Strip all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Ensure +1 prefix for US numbers
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('1') && cleaned.length === 11) return '+' + cleaned;
  if (cleaned.length === 10) return '+1' + cleaned;
  return '+' + cleaned;
}

// ─── PhoneInboundHandler ───────────────────────────────────────────────────

export class PhoneInboundHandler {
  private config: TwilioConfig;

  constructor(config?: TwilioConfig) {
    this.config = config ?? getTwilioConfig();
  }

  /**
   * Handle an incoming call from Twilio.
   * First-time call: authenticate caller, greet, start speech gather loop.
   * Returns TwiML XML string.
   */
  async handleIncomingCall(params: {
    callSid: string;
    from: string;
    to: string;
  }): Promise<string> {
    const { callSid, from, to } = params;
    const builder = new TwiMLBuilder();

    // Authenticate the caller
    const auth = await this.authenticateCaller(from);

    if (auth.authenticated && auth.userId && auth.userName) {
      // Create session for authenticated caller
      const sessionId = generateId('sess');
      const session: PhoneCallSession = {
        callSid,
        sessionId,
        userId: auth.userId,
        userName: auth.userName,
        direction: 'inbound',
        status: 'in-progress',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        transcript: [],
      };
      activeSessions.set(callSid, session);

      // Greeting for authenticated user
      const greeting = `Hey ${auth.userName}, it's Shadow. What's up?`;
      const actionUrl = `${this.config.baseUrl}/api/shadow/phone/inbound?callSid=${callSid}&sessionId=${sessionId}`;

      builder.gather(
        {
          input: 'speech',
          action: actionUrl,
          speechTimeout: 'auto',
          language: 'en-US',
        },
        greeting,
      );

      // Fallback if no speech detected
      builder.say('I didn\'t catch that. Call back anytime.');
      builder.hangup();
    } else if (auth.requiresStepUp) {
      // Unknown number -- require SMS code verification
      const verificationCode = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

      pendingVerificationCodes.set(normalizePhoneNumber(from), {
        code: verificationCode,
        expiresAt,
        userId: 'pending',
      });

      // Send SMS verification code
      await this.sendVerificationSMS(from, verificationCode);

      const actionUrl = `${this.config.baseUrl}/api/shadow/phone/inbound?callSid=${callSid}&stepUp=true&from=${encodeURIComponent(from)}`;

      builder.say(
        'Hey, I don\'t recognize this number. I just sent a verification code to this phone. ' +
        'Please enter the 6-digit code using your keypad.',
      );
      builder.gather({
        input: 'dtmf',
        action: actionUrl,
        timeout: 30,
        numDigits: 6,
      });

      // Fallback
      builder.say('I didn\'t receive a code. Please try calling back.');
      builder.hangup();
    } else {
      // No authentication possible
      builder.say(
        'Sorry, I can\'t verify your identity right now. Please try again later.',
      );
      builder.hangup();
    }

    return builder.build();
  }

  /**
   * Authenticate a caller by matching their phone number against trusted devices.
   */
  async authenticateCaller(phoneNumber: string): Promise<CallerAuthResult> {
    const normalized = normalizePhoneNumber(phoneNumber);

    // Check trusted devices store
    const device = trustedDevices.get(normalized);

    if (device && device.verified) {
      return {
        authenticated: true,
        userId: device.userId,
        userName: device.label,
        requiresStepUp: false,
      };
    }

    // Unknown number: require step-up authentication via SMS code
    return {
      authenticated: false,
      requiresStepUp: true,
    };
  }

  /**
   * Handle speech input during an active call conversation.
   * Processes the speech, generates a response, and continues the gather loop.
   * Returns TwiML XML string.
   */
  async handleSpeechInput(params: {
    callSid: string;
    sessionId: string;
    speechResult: string;
    confidence: number;
  }): Promise<string> {
    const { callSid, sessionId, speechResult, confidence } = params;
    const builder = new TwiMLBuilder();

    const session = activeSessions.get(callSid);
    if (!session) {
      builder.say('Sorry, I lost track of our conversation. Please call back.');
      builder.hangup();
      return builder.build();
    }

    // Record user's speech in transcript
    const userEntry: TranscriptEntry = {
      role: 'user',
      content: speechResult,
      timestamp: new Date(),
      confidence,
    };
    session.transcript.push(userEntry);
    session.lastActivityAt = new Date();

    // Check for end-call phrases
    if (this.isEndCallPhrase(speechResult)) {
      const farewell = `Alright${session.userName ? ', ' + session.userName : ''}, talk to you later. Bye!`;

      // Record Shadow's farewell
      session.transcript.push({
        role: 'shadow',
        content: farewell,
        timestamp: new Date(),
      });

      session.status = 'completed';

      builder.say(farewell);
      builder.hangup();
      return builder.build();
    }

    // Process speech and generate a response
    const response = await this.processConversation(session, speechResult, confidence);

    // Record Shadow's response in transcript
    session.transcript.push({
      role: 'shadow',
      content: response.text,
      timestamp: new Date(),
    });

    // If there's a companion SMS (link, follow-up), send it
    if (response.companionSms && session.userId) {
      await this.sendCompanionSMS(
        this.getPhoneForUser(session.userId),
        response.companionSms,
      );
    }

    // Continue the conversation loop
    const actionUrl = `${this.config.baseUrl}/api/shadow/phone/inbound?callSid=${callSid}&sessionId=${sessionId}`;

    builder.gather(
      {
        input: 'speech',
        action: actionUrl,
        speechTimeout: 'auto',
        language: 'en-US',
      },
      response.text,
    );

    // Fallback if no speech detected after response
    builder.say('Still there? I\'ll let you go. Call back anytime.');
    builder.hangup();

    return builder.build();
  }

  /**
   * Handle DTMF step-up authentication (verification code entry).
   */
  async handleStepUpAuth(params: {
    callSid: string;
    from: string;
    digits: string;
  }): Promise<string> {
    const { callSid, from, digits } = params;
    const builder = new TwiMLBuilder();
    const normalized = normalizePhoneNumber(from);

    const pending = pendingVerificationCodes.get(normalized);

    if (!pending) {
      builder.say('No verification code found. Please call back to try again.');
      builder.hangup();
      return builder.build();
    }

    if (new Date() > pending.expiresAt) {
      pendingVerificationCodes.delete(normalized);
      builder.say('Your verification code has expired. Please call back to get a new one.');
      builder.hangup();
      return builder.build();
    }

    if (digits !== pending.code) {
      builder.say('That code doesn\'t match. Please try again.');
      const actionUrl = `${this.config.baseUrl}/api/shadow/phone/inbound?callSid=${callSid}&stepUp=true&from=${encodeURIComponent(from)}`;
      builder.gather({
        input: 'dtmf',
        action: actionUrl,
        timeout: 30,
        numDigits: 6,
      });
      builder.say('No code received. Goodbye.');
      builder.hangup();
      return builder.build();
    }

    // Code matches -- authenticated
    pendingVerificationCodes.delete(normalized);

    // Create session for the now-verified caller
    const sessionId = generateId('sess');
    const session: PhoneCallSession = {
      callSid,
      sessionId,
      userId: 'verified-caller',
      userName: 'there',
      direction: 'inbound',
      status: 'in-progress',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      transcript: [],
    };
    activeSessions.set(callSid, session);

    const greeting = 'Verified! Hey there, it\'s Shadow. What can I help you with?';
    const actionUrl = `${this.config.baseUrl}/api/shadow/phone/inbound?callSid=${callSid}&sessionId=${sessionId}`;

    builder.gather(
      {
        input: 'speech',
        action: actionUrl,
        speechTimeout: 'auto',
        language: 'en-US',
      },
      greeting,
    );

    builder.say('I didn\'t catch that. Call back anytime.');
    builder.hangup();

    return builder.build();
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Process conversation input and generate a response.
   * In production, this would call the Shadow AI agent for intelligent responses.
   */
  private async processConversation(
    session: PhoneCallSession,
    speechResult: string,
    confidence: number,
  ): Promise<{ text: string; companionSms?: string }> {
    const lowConfidence = confidence < 0.5;

    if (lowConfidence) {
      return {
        text: 'I didn\'t quite catch that. Could you say that again?',
      };
    }

    // Check for common intents
    const lowerSpeech = speechResult.toLowerCase();

    if (lowerSpeech.includes('send') && lowerSpeech.includes('link')) {
      return {
        text: 'Sure, I\'ll send you a link right now. Check your messages.',
        companionSms: `Here's the link Shadow mentioned: ${this.config.baseUrl}/dashboard`,
      };
    }

    if (lowerSpeech.includes('schedule') || lowerSpeech.includes('calendar')) {
      return {
        text: 'Got it. I\'ll take a look at your calendar and get that sorted. Anything else?',
      };
    }

    if (lowerSpeech.includes('email') || lowerSpeech.includes('message')) {
      return {
        text: 'I can handle that. I\'ll draft it up and send you a preview to confirm. What else?',
      };
    }

    if (lowerSpeech.includes('task') || lowerSpeech.includes('reminder')) {
      return {
        text: 'Done, I\'ve noted that down. I\'ll make sure you don\'t forget. Anything else?',
      };
    }

    if (lowerSpeech.includes('status') || lowerSpeech.includes('update')) {
      return {
        text: 'Let me pull that up for you. I\'ll send a summary to your phone as well.',
        companionSms: 'Shadow status update: Check your dashboard for the latest details.',
      };
    }

    // Default: acknowledge and continue
    return {
      text: `Got it. I'll take care of that. Is there anything else?`,
    };
  }

  /**
   * Check if the speech input is an end-call phrase.
   */
  private isEndCallPhrase(speech: string): boolean {
    const endPhrases = [
      'goodbye', 'bye', 'that\'s all', 'that\'s it', 'hang up',
      'end call', 'nothing else', 'i\'m done', 'i\'m good',
      'no thanks', 'no thank you', 'talk to you later', 'later',
      'gotta go', 'see you', 'see ya',
    ];
    const lower = speech.toLowerCase().trim();
    return endPhrases.some((phrase) => lower.includes(phrase));
  }

  /**
   * Generate a 6-digit verification code.
   */
  private generateVerificationCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Send an SMS verification code to the caller.
   * Uses Twilio REST API directly.
   */
  private async sendVerificationSMS(to: string, code: string): Promise<void> {
    if (!isTwilioConfigured(this.config)) {
      console.warn('[PhoneInbound] Twilio not configured, skipping verification SMS');
      return;
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');

      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: this.config.phoneNumber,
          Body: `[Shadow] Your verification code is: ${code}. It expires in 5 minutes.`,
        }),
      });
    } catch (err) {
      console.error('[PhoneInbound] Failed to send verification SMS:', err);
    }
  }

  /**
   * Send a companion SMS during a call (links, summaries, etc.).
   */
  private async sendCompanionSMS(to: string, body: string): Promise<void> {
    if (!to || !isTwilioConfigured(this.config)) {
      return;
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');

      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: this.config.phoneNumber,
          Body: body,
        }),
      });
    } catch (err) {
      console.error('[PhoneInbound] Failed to send companion SMS:', err);
    }
  }

  /**
   * Look up a user's phone number from trusted devices.
   */
  private getPhoneForUser(userId: string): string {
    for (const device of trustedDevices.values()) {
      if (device.userId === userId && device.verified) {
        return device.phoneNumber;
      }
    }
    return '';
  }
}
