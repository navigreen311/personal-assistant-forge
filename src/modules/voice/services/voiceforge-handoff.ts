// ============================================================================
// VoiceForge Telephony Handoff Bridge
// Packages voice session context and prepares handoff records for VoiceForge
// telephony system. The actual telephony call is NOT implemented here —
// this creates a handoff record that VoiceForge would consume via event bus.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { VoiceForgeHandoff } from '@/modules/voice/types';

interface InitiateHandoffParams {
  voiceSessionId: string;
  contactId: string;
  entityId: string;
  phoneNumber: string;
  context: string;
  scriptHints?: string[];
}

class VoiceForgeHandoffService {
  private handoffs = new Map<string, VoiceForgeHandoff>();

  async initiateHandoff(params: InitiateHandoffParams): Promise<VoiceForgeHandoff> {
    const handoff: VoiceForgeHandoff = {
      id: uuidv4(),
      voiceSessionId: params.voiceSessionId,
      contactId: params.contactId,
      entityId: params.entityId,
      phoneNumber: params.phoneNumber,
      context: params.context,
      scriptHints: params.scriptHints ?? [],
      status: 'PENDING',
    };

    this.handoffs.set(handoff.id, handoff);

    // In production, this would emit an event to the VoiceForge telephony system:
    // await eventBus.emit('voiceforge:handoff:initiated', handoff);
    // The telephony system would then:
    // 1. Look up the entity's brand kit and voice persona
    // 2. Initialize the call with the contact's phone number
    // 3. Feed the context and script hints to the AI voice agent
    // 4. Update handoff status to CONNECTING -> ACTIVE -> COMPLETED

    return handoff;
  }

  async getHandoffStatus(handoffId: string): Promise<VoiceForgeHandoff> {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff "${handoffId}" not found`);
    }
    return handoff;
  }

  async cancelHandoff(handoffId: string): Promise<void> {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`Handoff "${handoffId}" not found`);
    }

    if (handoff.status === 'ACTIVE') {
      throw new Error('Cannot cancel an active handoff — the call is in progress');
    }

    handoff.status = 'FAILED';

    // In production: await eventBus.emit('voiceforge:handoff:cancelled', handoff);
  }

  // For testing and internal use
  getHandoff(handoffId: string): VoiceForgeHandoff | undefined {
    return this.handoffs.get(handoffId);
  }

  clearHandoffs(): void {
    this.handoffs.clear();
  }
}

export const voiceForgeHandoffService = new VoiceForgeHandoffService();
export { VoiceForgeHandoffService };
