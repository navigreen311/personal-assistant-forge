// ============================================================================
// VoiceForge Telephony Handoff Bridge
// Packages voice session context and prepares handoff records for VoiceForge
// telephony system. The actual telephony call is NOT implemented here —
// this creates a handoff record that VoiceForge would consume via event bus.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
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

    // Create a Call record to track the telephony handoff
    try {
      await prisma.call.create({
        data: {
          entityId: params.entityId,
          contactId: params.contactId,
          direction: 'OUTBOUND',
          outcome: 'CONNECTED',
          duration: 0,
          actionItems: [],
          transcript: `Handoff context: ${params.context}`,
        },
      });
    } catch {
      // Call record creation failed -- handoff can still proceed
    }

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
      throw new Error('Cannot cancel an active handoff');
    }

    handoff.status = 'FAILED';
    // No Call update needed -- the call was never connected
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
