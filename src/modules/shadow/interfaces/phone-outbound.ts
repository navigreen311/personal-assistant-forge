// ============================================================================
// Shadow Voice Agent — Phone Outbound Handler
// Handles outbound calls from Shadow to users: call initiation, voicemail,
// status callbacks, call window enforcement, and rate limiting.
// ============================================================================

import { TwiMLBuilder } from './twiml-builder';
import type {
  OutboundCallParams,
  OutboundCallResult,
  CallWindowConfig,
  CallRateLimitConfig,
  TrustedDevice,
  PhoneCallSession,
  PhoneCallStatus,
  TwilioConfig,
} from './phone-types';
import { getTwilioConfig, isTwilioConfigured } from './phone-types';

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_CALL_WINDOW: CallWindowConfig = {
  startHour: 9,
  endHour: 18,
  quietStartHour: 22,
  quietEndHour: 7,
  timezone: 'America/New_York',
};

const DEFAULT_RATE_LIMIT: CallRateLimitConfig = {
  maxPerDay: 5,
  maxPerHour: 2,
};

// ─── In-Memory Stores (production: replace with DB/Redis) ──────────────────

const trustedDevices = new Map<string, TrustedDevice[]>();
const outboundCallLog = new Map<string, { timestamp: Date; callSid: string }[]>();
const activeOutboundSessions = new Map<string, PhoneCallSession>();

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ─── Store Management (for testing) ────────────────────────────────────────

export function _resetStores(): void {
  trustedDevices.clear();
  outboundCallLog.clear();
  activeOutboundSessions.clear();
  idCounter = 0;
}

export function _addTrustedDevice(userId: string, device: TrustedDevice): void {
  const existing = trustedDevices.get(userId) ?? [];
  existing.push(device);
  trustedDevices.set(userId, existing);
}

export function _addCallLogEntry(userId: string, entry: { timestamp: Date; callSid: string }): void {
  const existing = outboundCallLog.get(userId) ?? [];
  existing.push(entry);
  outboundCallLog.set(userId, existing);
}

export function _getOutboundSession(callSid: string): PhoneCallSession | undefined {
  return activeOutboundSessions.get(callSid);
}

// ─── PhoneOutboundHandler ──────────────────────────────────────────────────

export class PhoneOutboundHandler {
  private config: TwilioConfig;
  private callWindow: CallWindowConfig;
  private rateLimit: CallRateLimitConfig;

  constructor(options?: {
    config?: TwilioConfig;
    callWindow?: CallWindowConfig;
    rateLimit?: CallRateLimitConfig;
  }) {
    this.config = options?.config ?? getTwilioConfig();
    this.callWindow = options?.callWindow ?? DEFAULT_CALL_WINDOW;
    this.rateLimit = options?.rateLimit ?? DEFAULT_RATE_LIMIT;
  }

  /**
   * Initiate an outbound call from Shadow to a user.
   * Enforces: trusted number, call window, rate limits.
   */
  async callUser(params: OutboundCallParams): Promise<OutboundCallResult> {
    const { userId, reason, priority, content, sessionId } = params;

    // 1. Look up trusted device for user
    const device = this.getTrustedDevice(userId);
    if (!device) {
      throw new Error(`No trusted phone number found for user ${userId}`);
    }

    // 2. Check call window (urgent calls bypass window check)
    if (priority !== 'urgent' && !this.isWithinCallWindow()) {
      throw new Error(
        `Outside call window (${this.callWindow.startHour}:00-${this.callWindow.endHour}:00). ` +
        `Use priority "urgent" to override.`,
      );
    }

    // 3. Check quiet hours (only urgent bypasses)
    if (priority !== 'urgent' && this.isQuietHours()) {
      throw new Error(
        `Quiet hours (${this.callWindow.quietStartHour}:00-${this.callWindow.quietEndHour}:00). ` +
        `Use priority "urgent" to override.`,
      );
    }

    // 4. Check rate limits
    const rateLimitResult = this.checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      throw new Error(rateLimitResult.reason);
    }

    // 5. Initiate the call via Twilio REST API
    if (!isTwilioConfigured(this.config)) {
      throw new Error('Twilio not configured');
    }

    const callSessionId = sessionId ?? generateId('sess');
    const statusCallbackUrl = `${this.config.baseUrl}/api/shadow/phone/status`;
    const callAnsweredUrl = `${this.config.baseUrl}/api/shadow/phone/outbound?event=answered&sessionId=${callSessionId}&userId=${userId}&userName=${encodeURIComponent(device.label)}&reason=${encodeURIComponent(reason)}&content=${encodeURIComponent(content)}`;

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Calls.json`;
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: device.phoneNumber,
          From: this.config.phoneNumber,
          Url: callAnsweredUrl,
          StatusCallback: statusCallbackUrl,
          StatusCallbackEvent: 'initiated ringing answered completed',
          MachineDetection: 'DetectMessageEnd',
          MachineDetectionTimeout: '10',
          Timeout: '30',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Twilio API error: ${response.status} ${errorText}`);
      }

      const result = await response.json() as { sid: string; status: string };

      // Log the call for rate limiting
      this.recordCall(userId, result.sid);

      // Create outbound session
      const session: PhoneCallSession = {
        callSid: result.sid,
        sessionId: callSessionId,
        userId,
        userName: device.label,
        direction: 'outbound',
        status: 'ringing',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        transcript: [],
      };
      activeOutboundSessions.set(result.sid, session);

      return {
        callSid: result.sid,
        status: result.status,
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Twilio API error:')) {
        throw err;
      }
      throw new Error(`Failed to initiate call: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate TwiML for voicemail when the user doesn't answer.
   * Leaves a 30-second summary and sends SMS follow-up.
   */
  async handleVoicemail(params: {
    callSid: string;
    userId: string;
    content: string;
  }): Promise<string> {
    const { callSid, userId, content } = params;
    const builder = new TwiMLBuilder();

    // Keep voicemail under 30 seconds (~75 words at normal pace)
    const voicemailText = this.buildVoicemailMessage(content);

    builder.say(voicemailText);
    builder.pause(1);
    builder.say('I\'ll also send you a text with the details. Talk soon.');
    builder.hangup();

    // Send SMS follow-up with full details
    const device = this.getTrustedDevice(userId);
    if (device) {
      await this.sendVoicemailSMS(device.phoneNumber, content);
    }

    // Update session status
    const session = activeOutboundSessions.get(callSid);
    if (session) {
      session.status = 'voicemail';
      session.transcript.push({
        role: 'shadow',
        content: voicemailText,
        timestamp: new Date(),
      });
    }

    return builder.build();
  }

  /**
   * Generate TwiML when the outbound call is answered.
   * Shadow introduces itself and states the reason for calling.
   */
  async handleCallAnswered(params: {
    callSid: string;
    sessionId: string;
    userName: string;
  }): Promise<string> {
    const { callSid, sessionId, userName } = params;
    const builder = new TwiMLBuilder();

    // Look up session for call context
    const session = activeOutboundSessions.get(callSid);
    const reason = session ? this.getCallReasonText(session) : '';

    const greeting = `Hey ${userName}, it's Shadow calling.${reason ? ' ' + reason : ''} Do you have a minute?`;

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

    // Fallback if no response
    builder.say(`No worries, I'll send you a text instead. Talk later, ${userName}.`);
    builder.hangup();

    // Update session
    if (session) {
      session.status = 'in-progress';
      session.lastActivityAt = new Date();
      session.transcript.push({
        role: 'shadow',
        content: greeting,
        timestamp: new Date(),
      });
    }

    return builder.build();
  }

  /**
   * Handle Twilio status callback for outbound calls.
   * Tracks call lifecycle: initiated → ringing → answered → completed/no-answer/busy/failed.
   */
  async handleStatusCallback(params: {
    callSid: string;
    callStatus: string;
    sessionId?: string;
    userId: string;
  }): Promise<void> {
    const { callSid, callStatus, userId } = params;

    const session = activeOutboundSessions.get(callSid);
    if (session) {
      session.status = this.mapTwilioStatus(callStatus);
      session.lastActivityAt = new Date();
    }

    // Handle terminal states
    switch (callStatus) {
      case 'completed':
        if (session) {
          session.status = 'completed';
        }
        break;

      case 'no-answer':
      case 'busy':
      case 'failed':
      case 'canceled':
        // Send SMS notification that we tried to call
        const device = this.getTrustedDevice(userId);
        if (device && callStatus !== 'failed') {
          await this.sendMissedCallSMS(device.phoneNumber, callStatus);
        }
        if (session) {
          session.status = this.mapTwilioStatus(callStatus);
        }
        break;
    }

    console.log(`[PhoneOutbound] Call ${callSid} status: ${callStatus}`);
  }

  // ─── Call Window & Rate Limiting ─────────────────────────────────────────

  /**
   * Check if the current time is within the allowed call window.
   */
  isWithinCallWindow(now?: Date): boolean {
    const current = now ?? new Date();
    const hour = current.getHours();
    return hour >= this.callWindow.startHour && hour < this.callWindow.endHour;
  }

  /**
   * Check if the current time is during quiet hours.
   */
  isQuietHours(now?: Date): boolean {
    const current = now ?? new Date();
    const hour = current.getHours();

    if (this.callWindow.quietStartHour > this.callWindow.quietEndHour) {
      // Quiet hours span midnight (e.g., 22:00-07:00)
      return hour >= this.callWindow.quietStartHour || hour < this.callWindow.quietEndHour;
    }
    return hour >= this.callWindow.quietStartHour && hour < this.callWindow.quietEndHour;
  }

  /**
   * Check rate limits for outbound calls to a user.
   */
  checkRateLimit(userId: string): { allowed: boolean; reason: string } {
    const log = outboundCallLog.get(userId) ?? [];
    const now = new Date();

    // Check hourly limit
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const callsLastHour = log.filter((entry) => entry.timestamp > oneHourAgo).length;
    if (callsLastHour >= this.rateLimit.maxPerHour) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${callsLastHour}/${this.rateLimit.maxPerHour} calls in the last hour`,
      };
    }

    // Check daily limit
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const callsToday = log.filter((entry) => entry.timestamp > startOfDay).length;
    if (callsToday >= this.rateLimit.maxPerDay) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${callsToday}/${this.rateLimit.maxPerDay} calls today`,
      };
    }

    return { allowed: true, reason: '' };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Get the primary trusted device for a user.
   */
  private getTrustedDevice(userId: string): TrustedDevice | null {
    const devices = trustedDevices.get(userId) ?? [];
    const verified = devices.find((d) => d.verified);
    return verified ?? null;
  }

  /**
   * Record a call in the rate-limiting log.
   */
  private recordCall(userId: string, callSid: string): void {
    const log = outboundCallLog.get(userId) ?? [];
    log.push({ timestamp: new Date(), callSid });
    outboundCallLog.set(userId, log);
  }

  /**
   * Build a voicemail message limited to ~30 seconds (~75 words).
   */
  private buildVoicemailMessage(content: string): string {
    const prefix = 'Hey, it\'s Shadow. ';
    const maxWords = 70;
    const words = content.split(/\s+/);

    if (words.length <= maxWords) {
      return prefix + content;
    }

    return prefix + words.slice(0, maxWords).join(' ') + '...';
  }

  /**
   * Get a brief reason text from the session context.
   */
  private getCallReasonText(_session: PhoneCallSession): string {
    // In production this would pull from session metadata
    return 'I have something to run by you.';
  }

  /**
   * Map Twilio call status strings to internal status type.
   */
  private mapTwilioStatus(twilioStatus: string): PhoneCallStatus {
    switch (twilioStatus.toLowerCase()) {
      case 'ringing':
      case 'queued':
        return 'ringing';
      case 'in-progress':
        return 'in-progress';
      case 'completed':
        return 'completed';
      case 'no-answer':
        return 'no-answer';
      case 'busy':
        return 'busy';
      case 'failed':
      case 'canceled':
        return 'failed';
      default:
        return 'in-progress';
    }
  }

  /**
   * Send an SMS that we left a voicemail.
   */
  private async sendVoicemailSMS(to: string, content: string): Promise<void> {
    if (!isTwilioConfigured(this.config)) return;

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');

      const truncatedContent = content.length > 120 ? content.slice(0, 117) + '...' : content;

      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: this.config.phoneNumber,
          Body: `[Shadow] I just left you a voicemail: ${truncatedContent}`,
        }),
      });
    } catch (err) {
      console.error('[PhoneOutbound] Failed to send voicemail SMS:', err);
    }
  }

  /**
   * Send an SMS that Shadow tried to call.
   */
  private async sendMissedCallSMS(to: string, reason: string): Promise<void> {
    if (!isTwilioConfigured(this.config)) return;

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');

      const statusText = reason === 'busy' ? 'your line was busy' : 'you didn\'t pick up';

      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: this.config.phoneNumber,
          Body: `[Shadow] I tried calling but ${statusText}. Let me know when you're free, or call me back.`,
        }),
      });
    } catch (err) {
      console.error('[PhoneOutbound] Failed to send missed call SMS:', err);
    }
  }
}
