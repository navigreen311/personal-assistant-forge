// ============================================================================
// Shadow Voice Agent — SMS Handler
// Handles sending/receiving SMS, call summaries, companion messages,
// and inbound SMS command processing.
// ============================================================================

import type {
  SmsSendParams,
  SmsSendResult,
  SmsInboundParams,
  SmsInboundResult,
  CallSummaryParams,
  TrustedDevice,
  TwilioConfig,
} from './phone-types';
import { getTwilioConfig, isTwilioConfigured } from './phone-types';

// ─── In-Memory Stores (production: replace with DB/Redis) ──────────────────

const trustedDevices = new Map<string, TrustedDevice[]>();
const smsLog: Array<{
  messageSid: string;
  to: string;
  body: string;
  direction: 'outbound' | 'inbound';
  timestamp: Date;
}> = [];

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ─── Store Management (for testing) ────────────────────────────────────────

export function _resetStores(): void {
  trustedDevices.clear();
  smsLog.length = 0;
  idCounter = 0;
}

export function _addTrustedDevice(userId: string, device: TrustedDevice): void {
  const existing = trustedDevices.get(userId) ?? [];
  existing.push(device);
  trustedDevices.set(userId, existing);
}

export function _getSmsLog(): typeof smsLog {
  return [...smsLog];
}

// ─── Phone Number Normalization ────────────────────────────────────────────

function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('1') && cleaned.length === 11) return '+' + cleaned;
  if (cleaned.length === 10) return '+1' + cleaned;
  return '+' + cleaned;
}

// ─── ShadowSMS ────────────────────────────────────────────────────────────

export class ShadowSMS {
  private config: TwilioConfig;

  constructor(config?: TwilioConfig) {
    this.config = config ?? getTwilioConfig();
  }

  /**
   * Send an SMS message from Shadow to a user.
   * Looks up the user's trusted device if no `to` number is provided.
   * Optionally appends a deep link to the message body.
   */
  async sendSMS(params: SmsSendParams): Promise<SmsSendResult> {
    const { userId, to, body, deepLink } = params;

    // Resolve recipient phone number
    const recipient = to ? normalizePhoneNumber(to) : this.getPhoneForUser(userId);
    if (!recipient) {
      throw new Error(`No phone number found for user ${userId}`);
    }

    // Build message body with optional deep link
    let messageBody = body;
    if (deepLink) {
      messageBody += `\n${deepLink}`;
    }

    // Enforce SMS length warning (we still send, but log if over limit)
    if (messageBody.length > 1600) {
      console.warn(`[ShadowSMS] Message exceeds 1600 chars (${messageBody.length}), will be split into multiple segments`);
    }

    if (!isTwilioConfigured(this.config)) {
      // Return a mock result when Twilio is not configured (dev mode)
      const mockSid = generateId('SM_mock');
      smsLog.push({
        messageSid: mockSid,
        to: recipient,
        body: messageBody,
        direction: 'outbound',
        timestamp: new Date(),
      });
      return { messageSid: mockSid, status: 'queued' };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: recipient,
          From: this.config.phoneNumber,
          Body: messageBody,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Twilio API error: ${response.status} ${errorText}`);
      }

      const result = await response.json() as { sid: string; status: string };

      smsLog.push({
        messageSid: result.sid,
        to: recipient,
        body: messageBody,
        direction: 'outbound',
        timestamp: new Date(),
      });

      return { messageSid: result.sid, status: result.status };
    } catch (err) {
      throw new Error(`Failed to send SMS: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle an inbound SMS from a user.
   * Parses the message for commands or treats it as a conversation message.
   */
  async handleInboundSMS(params: SmsInboundParams): Promise<SmsInboundResult> {
    const { from, body } = params;
    const normalizedFrom = normalizePhoneNumber(from);

    // Log the inbound message
    smsLog.push({
      messageSid: generateId('SM_in'),
      to: this.config.phoneNumber,
      body,
      direction: 'inbound',
      timestamp: new Date(),
    });

    // Identify the sender
    const sender = this.findUserByPhone(normalizedFrom);
    if (!sender) {
      return {
        response: 'Sorry, I don\'t recognize this number. Please set up your device in Shadow settings first.',
      };
    }

    // Parse for commands
    const trimmedBody = body.trim();
    const command = this.parseCommand(trimmedBody);

    if (command) {
      return this.handleCommand(command, sender);
    }

    // Treat as a conversational message
    return this.handleConversationalSMS(trimmedBody, sender);
  }

  /**
   * Send a post-call summary with action items as an SMS.
   */
  async sendCallSummary(params: CallSummaryParams): Promise<void> {
    const { userId, sessionId, summary, actionItems } = params;

    let body = `[Shadow] Call Summary (${sessionId.slice(-6)}):\n${summary}`;

    if (actionItems.length > 0) {
      body += '\n\nAction Items:';
      for (let i = 0; i < actionItems.length; i++) {
        body += `\n${i + 1}. ${actionItems[i]}`;
      }
    }

    await this.sendSMS({
      userId,
      body,
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Get the primary phone number for a user from trusted devices.
   */
  private getPhoneForUser(userId: string): string {
    const devices = trustedDevices.get(userId) ?? [];
    const verified = devices.find((d) => d.verified);
    return verified?.phoneNumber ?? '';
  }

  /**
   * Find a user by their phone number across all trusted devices.
   */
  private findUserByPhone(phone: string): { userId: string; label: string } | null {
    for (const [userId, devices] of trustedDevices.entries()) {
      for (const device of devices) {
        if (normalizePhoneNumber(device.phoneNumber) === phone && device.verified) {
          return { userId, label: device.label };
        }
      }
    }
    return null;
  }

  /**
   * Parse a text message for known command patterns.
   */
  private parseCommand(body: string): { command: string; args: string } | null {
    const lower = body.toLowerCase().trim();

    // Direct commands
    if (lower === 'status' || lower === 'status?') {
      return { command: 'status', args: '' };
    }
    if (lower === 'help' || lower === 'help?') {
      return { command: 'help', args: '' };
    }
    if (lower.startsWith('remind ') || lower.startsWith('reminder ')) {
      const args = body.slice(lower.startsWith('remind ') ? 7 : 9).trim();
      return { command: 'remind', args };
    }
    if (lower.startsWith('task ')) {
      return { command: 'task', args: body.slice(5).trim() };
    }
    if (lower.startsWith('note ')) {
      return { command: 'note', args: body.slice(5).trim() };
    }
    if (lower === 'call me' || lower === 'call me back') {
      return { command: 'callback', args: '' };
    }
    if (lower === 'stop' || lower === 'unsubscribe') {
      return { command: 'stop', args: '' };
    }

    return null;
  }

  /**
   * Handle a recognized command from SMS.
   */
  private handleCommand(
    parsed: { command: string; args: string },
    sender: { userId: string; label: string },
  ): SmsInboundResult {
    switch (parsed.command) {
      case 'status':
        return {
          response: `Hey ${sender.label}, everything's running smoothly. Check your dashboard for details.`,
          actionTaken: 'status_check',
        };

      case 'help':
        return {
          response:
            'Shadow SMS Commands:\n' +
            '- "status" - quick status check\n' +
            '- "remind [text]" - set a reminder\n' +
            '- "task [text]" - create a task\n' +
            '- "note [text]" - save a note\n' +
            '- "call me" - request a callback\n' +
            '- Or just text me anything!',
          actionTaken: 'help_shown',
        };

      case 'remind':
        return {
          response: `Got it, I'll remind you: "${parsed.args}". I'll follow up on this.`,
          actionTaken: 'reminder_created',
        };

      case 'task':
        return {
          response: `Task created: "${parsed.args}". I'll track it for you.`,
          actionTaken: 'task_created',
        };

      case 'note':
        return {
          response: `Noted: "${parsed.args}"`,
          actionTaken: 'note_saved',
        };

      case 'callback':
        return {
          response: `Sure thing, ${sender.label}. I'll call you shortly.`,
          actionTaken: 'callback_requested',
        };

      case 'stop':
        return {
          response: 'You\'ve been unsubscribed from Shadow SMS notifications. Text "start" to re-enable.',
          actionTaken: 'unsubscribed',
        };

      default:
        return {
          response: 'I didn\'t understand that command. Text "help" for available commands.',
        };
    }
  }

  /**
   * Handle a free-form conversational SMS.
   */
  private handleConversationalSMS(
    body: string,
    sender: { userId: string; label: string },
  ): SmsInboundResult {
    // In production, this would route to the Shadow AI agent for processing
    const lower = body.toLowerCase();

    if (lower.includes('yes') || lower.includes('confirm') || lower.includes('approve')) {
      return {
        response: 'Confirmed. I\'ll take care of it.',
        actionTaken: 'confirmation_received',
      };
    }

    if (lower.includes('no') || lower.includes('cancel') || lower.includes('deny')) {
      return {
        response: 'Understood, I\'ve cancelled that action.',
        actionTaken: 'cancellation_received',
      };
    }

    if (lower.includes('thank')) {
      return {
        response: `Anytime, ${sender.label}!`,
      };
    }

    return {
      response: `Got your message, ${sender.label}. I'll process that and get back to you.`,
      actionTaken: 'message_queued',
    };
  }
}
