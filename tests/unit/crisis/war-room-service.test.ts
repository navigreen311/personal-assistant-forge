import {
  activateWarRoom,
  deactivateWarRoom,
  getWarRoomState,
  addWarRoomDocument,
} from '@/modules/crisis/services/war-room-service';
import {
  createCrisisEvent,
  getCrisisById,
} from '@/modules/crisis/services/detection-service';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue(
    'Initial stakeholder notification for the crisis.\n---\nStatus update template: the situation is under control.'
  ),
  generateJSON: jest.fn().mockResolvedValue({
    isCrisis: false,
    confidence: 0.1,
    explanation: 'mock',
  }),
}));

// Mock escalation and playbook services
jest.mock('@/modules/crisis/services/escalation-service', () => ({
  getEscalationChain: jest.fn().mockReturnValue({
    crisisType: 'DATA_BREACH',
    steps: [
      { order: 1, contactName: 'CTO', contactMethod: 'PHONE', escalateAfterMinutes: 5 },
      { order: 2, contactName: 'Security Lead', contactMethod: 'PHONE', escalateAfterMinutes: 10 },
    ],
  }),
}));

jest.mock('@/modules/crisis/services/playbook-service', () => ({
  getPlaybook: jest.fn().mockReturnValue({
    id: 'pb-breach',
    name: 'Data Breach Response',
    crisisType: 'DATA_BREACH',
    estimatedResolutionHours: 72,
    steps: [],
  }),
}));

const { generateText } = require('@/lib/ai');

describe('WarRoomService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('activateWarRoom', () => {
    it('should activate war room with cleared events, documents, and drafted comms', async () => {
      const crisis = await createCrisisEvent(
        'user-wr-1', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Server Breach', 'Unauthorized access detected'
      );

      const warRoom = await activateWarRoom(crisis.id);

      expect(warRoom.isActive).toBe(true);
      expect(warRoom.activatedAt).toBeInstanceOf(Date);
      expect(warRoom.clearedCalendarEvents.length).toBeGreaterThan(0);
      expect(warRoom.surfacedDocuments.length).toBeGreaterThan(0);
      expect(warRoom.draftedComms.length).toBeGreaterThan(0);
    });

    it('should use AI to generate stakeholder communications', async () => {
      const crisis = await createCrisisEvent(
        'user-wr-2', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'AI Comms Test', 'desc'
      );

      await activateWarRoom(crisis.id);

      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('should fall back to default comms when AI fails', async () => {
      generateText.mockRejectedValueOnce(new Error('AI unavailable'));

      const crisis = await createCrisisEvent(
        'user-wr-3', 'entity-1', 'DATA_BREACH', 'HIGH', 'Fallback test', 'desc'
      );

      const warRoom = await activateWarRoom(crisis.id);

      expect(warRoom.draftedComms.length).toBeGreaterThan(0);
      expect(warRoom.draftedComms[0]).toContain('Fallback test');
    });

    it('should throw for non-existent crisis ID', async () => {
      await expect(activateWarRoom('nonexistent')).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });

    it('should persist war room state on the crisis object', async () => {
      const crisis = await createCrisisEvent(
        'user-wr-4', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Persist test', 'desc'
      );

      await activateWarRoom(crisis.id);

      const updatedCrisis = getCrisisById(crisis.id);
      expect(updatedCrisis!.warRoom.isActive).toBe(true);
    });
  });

  describe('deactivateWarRoom', () => {
    it('should set war room isActive to false', async () => {
      const crisis = await createCrisisEvent(
        'user-deact-1', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Deact test', 'desc'
      );
      await activateWarRoom(crisis.id);

      await deactivateWarRoom(crisis.id);

      const state = await getWarRoomState(crisis.id);
      expect(state.isActive).toBe(false);
    });

    it('should throw for non-existent crisis ID', async () => {
      await expect(deactivateWarRoom('nonexistent')).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });
  });

  describe('getWarRoomState', () => {
    it('should return the current war room state', async () => {
      const crisis = await createCrisisEvent(
        'user-state-1', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'State test', 'desc'
      );

      const state = await getWarRoomState(crisis.id);

      expect(state).toHaveProperty('isActive');
      expect(state).toHaveProperty('clearedCalendarEvents');
      expect(state).toHaveProperty('surfacedDocuments');
      expect(state).toHaveProperty('draftedComms');
      expect(state).toHaveProperty('participants');
    });

    it('should throw for non-existent crisis ID', async () => {
      await expect(getWarRoomState('nonexistent')).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });
  });

  describe('addWarRoomDocument', () => {
    it('should add a document to the surfaced documents list', async () => {
      const crisis = await createCrisisEvent(
        'user-doc-1', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Doc test', 'desc'
      );
      await activateWarRoom(crisis.id);

      const state = await addWarRoomDocument(crisis.id, 'new-doc-id');

      expect(state.surfacedDocuments).toContain('new-doc-id');
    });

    it('should not duplicate an existing document ID', async () => {
      const crisis = await createCrisisEvent(
        'user-doc-2', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Dup test', 'desc'
      );
      await activateWarRoom(crisis.id);

      await addWarRoomDocument(crisis.id, 'unique-doc');
      const state = await addWarRoomDocument(crisis.id, 'unique-doc');

      const count = state.surfacedDocuments.filter((d) => d === 'unique-doc').length;
      expect(count).toBe(1);
    });

    it('should throw for non-existent crisis ID', async () => {
      await expect(addWarRoomDocument('nonexistent', 'doc-1')).rejects.toThrow(
        'Crisis nonexistent not found'
      );
    });
  });
});
