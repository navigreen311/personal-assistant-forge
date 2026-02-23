// ============================================================================
// Shadow Voice Agent — Phone Interface Types
// Types for inbound/outbound phone calls, SMS, and Twilio integration.
// ============================================================================

// ─── Twilio Webhook Params ─────────────────────────────────────────────────

export interface TwilioInboundCallParams {
  CallSid: string;
  From: string;
  To: string;
  CallStatus?: string;
  Direction?: string;
  SpeechResult?: string;
  Confidence?: string;
  Digits?: string;
}

export interface TwilioSmsParams {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
}

export interface TwilioStatusCallbackParams {
  CallSid: string;
  CallStatus: string;
  CallDuration?: string;
  To?: string;
  From?: string;
}

// ─── Caller Authentication ─────────────────────────────────────────────────

export interface CallerAuthResult {
  authenticated: boolean;
  userId?: string;
  userName?: string;
  requiresStepUp: boolean;
}

export interface TrustedDevice {
  id: string;
  userId: string;
  phoneNumber: string;
  label: string;
  verified: boolean;
  lastUsed?: Date;
  createdAt: Date;
}

// ─── Call Session ──────────────────────────────────────────────────────────

export interface PhoneCallSession {
  callSid: string;
  sessionId: string;
  userId?: string;
  userName?: string;
  direction: 'inbound' | 'outbound';
  status: PhoneCallStatus;
  startedAt: Date;
  lastActivityAt: Date;
  transcript: TranscriptEntry[];
}

export interface TranscriptEntry {
  role: 'user' | 'shadow';
  content: string;
  timestamp: Date;
  confidence?: number;
}

export type PhoneCallStatus =
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'no-answer'
  | 'busy'
  | 'failed'
  | 'voicemail';

// ─── Outbound Call Config ──────────────────────────────────────────────────

export interface OutboundCallParams {
  userId: string;
  reason: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  content: string;
  sessionId?: string;
}

export interface OutboundCallResult {
  callSid: string;
  status: string;
}

export interface CallWindowConfig {
  startHour: number; // 0-23
  endHour: number;   // 0-23
  quietStartHour: number;
  quietEndHour: number;
  timezone: string;
}

export interface CallRateLimitConfig {
  maxPerDay: number;
  maxPerHour: number;
}

// ─── SMS Types ─────────────────────────────────────────────────────────────

export interface SmsSendParams {
  userId: string;
  to?: string;
  body: string;
  deepLink?: string;
}

export interface SmsSendResult {
  messageSid: string;
  status: string;
}

export interface SmsInboundParams {
  from: string;
  body: string;
}

export interface SmsInboundResult {
  response: string;
  actionTaken?: string;
}

export interface CallSummaryParams {
  userId: string;
  sessionId: string;
  summary: string;
  actionItems: string[];
}

// ─── TwiML Builder Types ───────────────────────────────────────────────────

export interface GatherOptions {
  input?: string;
  action?: string;
  speechTimeout?: string;
  language?: string;
  timeout?: number;
  numDigits?: number;
}

export interface RecordOptions {
  maxLength?: number;
  action?: string;
  transcribe?: boolean;
  playBeep?: boolean;
}

// ─── Twilio Config ─────────────────────────────────────────────────────────

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  baseUrl: string;
}

export function getTwilioConfig(): TwilioConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? '';
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER ?? '';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://localhost:3000';

  return { accountSid, authToken, phoneNumber, baseUrl };
}

export function isTwilioConfigured(config: TwilioConfig): boolean {
  return !!(config.accountSid && config.authToken && config.phoneNumber);
}
