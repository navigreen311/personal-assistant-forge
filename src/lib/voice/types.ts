// ============================================================================
// VoiceForge — Voice Infrastructure Types
// ============================================================================

export interface VoiceProvider {
  name: string;
  provisionNumber(areaCode: string): Promise<ProvisionedNumber>;
  releaseNumber(phoneNumber: string): Promise<void>;
  initiateCall(config: OutboundCallConfig): Promise<CallSession>;
  getCallStatus(callSid: string): Promise<CallStatus>;
}

export interface ProvisionedNumber {
  phoneNumber: string;
  sid: string;
  region: string;
  capabilities: ('VOICE' | 'SMS' | 'MMS')[];
  monthlyRate: number;
  provisionedAt: Date;
}

export interface OutboundCallConfig {
  from: string;
  to: string;
  personaId: string;
  scriptId?: string;
  maxDuration: number;
  recordCall: boolean;
  consentRequired: boolean;
}

export interface CallSession {
  callSid: string;
  status: CallStatus;
  startedAt: Date;
}

export type CallStatus =
  | 'QUEUED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'CANCELLED';

export interface ConsentCheck {
  allowed: boolean;
  reason: string;
  consentType: 'ONE_PARTY' | 'TWO_PARTY' | 'UNKNOWN';
  jurisdiction: string;
  recordingAllowed: boolean;
}
