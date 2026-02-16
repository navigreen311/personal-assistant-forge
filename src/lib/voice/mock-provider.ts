// ============================================================================
// VoiceForge — Mock Voice Provider for Development/Testing
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  VoiceProvider,
  ProvisionedNumber,
  OutboundCallConfig,
  CallSession,
  CallStatus,
} from './types';

export class MockVoiceProvider implements VoiceProvider {
  name = 'mock';
  private delay: number;
  private callStatuses: Map<string, CallStatus> = new Map();

  constructor(options?: { delay?: number }) {
    this.delay = options?.delay ?? 100;
  }

  private async simulateDelay(): Promise<void> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }
  }

  private generatePhoneNumber(areaCode: string): string {
    const line = Math.floor(1000000 + Math.random() * 9000000)
      .toString()
      .slice(0, 7);
    return `+1${areaCode}${line}`;
  }

  async provisionNumber(areaCode: string): Promise<ProvisionedNumber> {
    await this.simulateDelay();
    return {
      phoneNumber: this.generatePhoneNumber(areaCode),
      sid: `PN${uuidv4().replace(/-/g, '').slice(0, 32)}`,
      region: `US-${areaCode}`,
      capabilities: ['VOICE', 'SMS'],
      monthlyRate: 1.5,
      provisionedAt: new Date(),
    };
  }

  async releaseNumber(_phoneNumber: string): Promise<void> {
    await this.simulateDelay();
  }

  async initiateCall(config: OutboundCallConfig): Promise<CallSession> {
    await this.simulateDelay();
    const callSid = `CA${uuidv4().replace(/-/g, '').slice(0, 32)}`;
    this.callStatuses.set(callSid, 'QUEUED');

    // Simulate call progression
    setTimeout(() => this.callStatuses.set(callSid, 'RINGING'), this.delay);
    setTimeout(() => this.callStatuses.set(callSid, 'IN_PROGRESS'), this.delay * 2);
    setTimeout(() => this.callStatuses.set(callSid, 'COMPLETED'), config.maxDuration * 1000);

    return {
      callSid,
      status: 'QUEUED',
      startedAt: new Date(),
    };
  }

  async getCallStatus(callSid: string): Promise<CallStatus> {
    await this.simulateDelay();
    return this.callStatuses.get(callSid) ?? 'FAILED';
  }

  /** Set a specific status for testing */
  setCallStatus(callSid: string, status: CallStatus): void {
    this.callStatuses.set(callSid, status);
  }
}

// ============================================================================
// Twilio Voice Provider Stub
// Production implementation would use @twilio-sdk/voice.
// This stub provides the correct interface shape for type-checking
// and development without requiring Twilio credentials.
// ============================================================================

export class TwilioProviderStub implements VoiceProvider {
  name = 'twilio';

  async provisionNumber(_areaCode: string): Promise<ProvisionedNumber> {
    throw new Error('Twilio provider not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  async releaseNumber(_phoneNumber: string): Promise<void> {
    throw new Error('Twilio provider not configured.');
  }

  async initiateCall(_config: OutboundCallConfig): Promise<CallSession> {
    throw new Error('Twilio provider not configured.');
  }

  async getCallStatus(_callSid: string): Promise<CallStatus> {
    throw new Error('Twilio provider not configured.');
  }
}

// ============================================================================
// ElevenLabs TTS Provider Stub
// Production implementation would use @elevenlabs/api.
// ============================================================================

export class ElevenLabsProviderStub {
  name = 'elevenlabs';

  async generateSpeech(_text: string, _voiceId: string): Promise<ArrayBuffer> {
    throw new Error('ElevenLabs provider not configured. Set ELEVENLABS_API_KEY.');
  }

  async listVoices(): Promise<Array<{ id: string; name: string }>> {
    throw new Error('ElevenLabs provider not configured.');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createVoiceProvider(type: 'mock' | 'twilio' = 'mock'): VoiceProvider {
  switch (type) {
    case 'twilio':
      return new TwilioProviderStub();
    case 'mock':
    default:
      return new MockVoiceProvider();
  }
}
