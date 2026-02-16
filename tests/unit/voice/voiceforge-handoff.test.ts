jest.mock('@/lib/db', () => ({
  prisma: {
    call: {
      create: jest.fn().mockResolvedValue({
        id: 'call-handoff-1',
        entityId: 'entity-1',
        contactId: 'contact-1',
        direction: 'OUTBOUND',
      }),
    },
  },
}));

import { VoiceForgeHandoffService } from '@/modules/voice/services/voiceforge-handoff';
import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('VoiceForgeHandoff', () => {
  let service: VoiceForgeHandoffService;

  beforeEach(() => {
    service = new VoiceForgeHandoffService();
    jest.clearAllMocks();
  });

  describe('initiateHandoff', () => {
    it('should create a handoff record with PENDING status', async () => {
      const handoff = await service.initiateHandoff({
        voiceSessionId: 'session-1',
        contactId: 'contact-1',
        entityId: 'entity-1',
        phoneNumber: '+15551234567',
        context: 'Calling about the Q4 review',
      });

      expect(handoff.id).toBeDefined();
      expect(handoff.status).toBe('PENDING');
      expect(handoff.voiceSessionId).toBe('session-1');
      expect(handoff.contactId).toBe('contact-1');
    });

    it('should include voice session context in handoff', async () => {
      const context = 'Discussion about downtown property inspection results';
      const handoff = await service.initiateHandoff({
        voiceSessionId: 'session-1',
        contactId: 'contact-1',
        entityId: 'entity-1',
        phoneNumber: '+15551234567',
        context,
        scriptHints: ['Be polite', 'Ask about availability'],
      });

      expect(handoff.context).toBe(context);
      expect(handoff.scriptHints).toEqual(['Be polite', 'Ask about availability']);
    });

    it('should resolve contact phone number', async () => {
      const handoff = await service.initiateHandoff({
        voiceSessionId: 'session-1',
        contactId: 'contact-1',
        entityId: 'entity-1',
        phoneNumber: '+15559876543',
        context: 'Follow up call',
      });

      expect(handoff.phoneNumber).toBe('+15559876543');
    });

    it('should create a Call record via Prisma', async () => {
      await service.initiateHandoff({
        voiceSessionId: 'session-1',
        contactId: 'contact-1',
        entityId: 'entity-1',
        phoneNumber: '+15551234567',
        context: 'Test handoff',
      });

      expect(mockPrisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityId: 'entity-1',
            contactId: 'contact-1',
            direction: 'OUTBOUND',
          }),
        })
      );
    });

    it('should still succeed if Call record creation fails', async () => {
      (mockPrisma.call.create as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const handoff = await service.initiateHandoff({
        voiceSessionId: 'session-1',
        contactId: 'contact-1',
        entityId: 'entity-1',
        phoneNumber: '+15551234567',
        context: 'Test handoff',
      });

      expect(handoff.id).toBeDefined();
      expect(handoff.status).toBe('PENDING');
    });
  });

  describe('getHandoffStatus', () => {
    it('should return handoff status', async () => {
      const handoff = await service.initiateHandoff({
        voiceSessionId: 'session-1',
        contactId: 'contact-1',
        entityId: 'entity-1',
        phoneNumber: '+15551234567',
        context: 'Test call',
      });

      const status = await service.getHandoffStatus(handoff.id);
      expect(status.id).toBe(handoff.id);
      expect(status.status).toBe('PENDING');
    });

    it('should throw for non-existent handoff', async () => {
      await expect(service.getHandoffStatus('fake-id')).rejects.toThrow(
        'Handoff "fake-id" not found',
      );
    });
  });

  describe('cancelHandoff', () => {
    it('should update status to FAILED for pending handoffs', async () => {
      const handoff = await service.initiateHandoff({
        voiceSessionId: 'session-1',
        contactId: 'contact-1',
        entityId: 'entity-1',
        phoneNumber: '+15551234567',
        context: 'Test call',
      });

      await service.cancelHandoff(handoff.id);

      const updated = service.getHandoff(handoff.id);
      expect(updated?.status).toBe('FAILED');
    });

    it('should throw for already-active handoffs', async () => {
      const handoff = await service.initiateHandoff({
        voiceSessionId: 'session-1',
        contactId: 'contact-1',
        entityId: 'entity-1',
        phoneNumber: '+15551234567',
        context: 'Test call',
      });

      // Manually set to ACTIVE to simulate an in-progress call
      const stored = service.getHandoff(handoff.id);
      if (stored) stored.status = 'ACTIVE';

      await expect(service.cancelHandoff(handoff.id)).rejects.toThrow(
        'Cannot cancel an active handoff',
      );
    });

    it('should throw for non-existent handoff', async () => {
      await expect(service.cancelHandoff('fake-id')).rejects.toThrow(
        'Handoff "fake-id" not found',
      );
    });
  });
});
