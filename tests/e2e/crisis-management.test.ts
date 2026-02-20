/**
 * E2E Test: Crisis Management
 * Tests: detection -> create -> acknowledge -> war room -> dead man switch -> escalation
 *
 * Services under test:
 * - detection-service.ts (analyzeSignals, createCrisisEvent, getActiveCrises, getCrisisById, updateCrisis)
 * - war-room-service.ts (activateWarRoom, deactivateWarRoom, getWarRoomState, addWarRoomDocument)
 * - dead-man-switch-service.ts (configure, checkIn, evaluateSwitch, getStatus, addProtocol)
 * - escalation-service.ts (getEscalationChain, setEscalationChain, executeEscalation, acknowledgeEscalation, getEscalationStatus)
 */

// --- Infrastructure mocks ---

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Stakeholder notification.\n---\nStatus update template.'),
  generateJSON: jest.fn().mockResolvedValue({ isCrisis: false, confidence: 0.1, explanation: 'AI: No crisis detected.' }),
}));

jest.mock('@/modules/crisis/services/playbook-service', () => ({
  getPlaybook: jest.fn().mockReturnValue({ id: 'pb-legal', name: 'Legal Threat Response', crisisType: 'LEGAL_THREAT', estimatedResolutionHours: 72, steps: [] }),
}));

import { analyzeSignals, createCrisisEvent, getActiveCrises, getCrisisById, updateCrisis } from '@/modules/crisis/services/detection-service';
import { activateWarRoom, deactivateWarRoom, getWarRoomState, addWarRoomDocument } from '@/modules/crisis/services/war-room-service';
import { configure, checkIn, evaluateSwitch, getStatus, addProtocol } from '@/modules/crisis/services/dead-man-switch-service';
import { getEscalationChain, setEscalationChain, executeEscalation, acknowledgeEscalation, getEscalationStatus } from '@/modules/crisis/services/escalation-service';
import type { CrisisDetectionSignal, EscalationChainConfig, DeadManProtocol } from '@/modules/crisis/types';

const { generateText, generateJSON } = require('@/lib/ai');

describe('Crisis Management E2E', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('Crisis Detection', () => {
    it('should return no crisis for empty signals', async () => {
      const r = await analyzeSignals([]);
      expect(r.isCrisis).toBe(false);
      expect(r.confidence).toBe(0);
    });

    it('should detect LEGAL_THREAT', async () => {
      const r = await analyzeSignals([{ source: 'email', signalType: 'message', confidence: 0.9, rawData: { body: 'We will file a lawsuit against your company.' }, timestamp: new Date() }]);
      expect(r.isCrisis).toBe(true);
      expect(r.type).toBe('LEGAL_THREAT');
    });

    it('should detect DATA_BREACH', async () => {
      const r = await analyzeSignals([{ source: 'security', signalType: 'alert', confidence: 0.8, rawData: { body: 'Unauthorized access detected on server cluster.' }, timestamp: new Date() }]);
      expect(r.isCrisis).toBe(true);
      expect(r.type).toBe('DATA_BREACH');
      expect(r.severity).toBe('CRITICAL');
    });

    it('should detect HEALTH_EMERGENCY', async () => {
      const now = new Date();
      const r = await analyzeSignals([
        { source: 'calendar', signalType: 'calendar_cancellation', confidence: 0.7, rawData: { body: '' }, timestamp: now },
        { source: 'checkin', signalType: 'missed_checkin', confidence: 0.8, rawData: { body: '' }, timestamp: now },
        { source: 'message', signalType: 'message', confidence: 0.9, rawData: { body: 'I am at the hospital for an emergency procedure.' }, timestamp: now },
      ]);
      expect(r.isCrisis).toBe(true);
      expect(r.type).toBe('HEALTH_EMERGENCY');
    });

    it('should detect FINANCIAL_ANOMALY', async () => {
      const r = await analyzeSignals([
        { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 100 }, timestamp: new Date() },
        { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 200 }, timestamp: new Date() },
        { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 150 }, timestamp: new Date() },
      ]);
      expect(r.isCrisis).toBe(true);
      expect(r.type).toBe('FINANCIAL_ANOMALY');
    });

    it('should detect PR_ISSUE', async () => {
      const now = new Date();
      const r = await analyzeSignals([
        { source: 'social', signalType: 'negative_sentiment', confidence: 0.8, rawData: { body: 'Terrible service', contactId: 'c1' }, timestamp: now },
        { source: 'social', signalType: 'negative_sentiment', confidence: 0.7, rawData: { body: 'Disappointed', contactId: 'c2' }, timestamp: now },
      ]);
      expect(r.isCrisis).toBe(true);
      expect(r.type).toBe('PR_ISSUE');
    });

    it('should fall back to AI when no patterns match', async () => {
      const r = await analyzeSignals([{ source: 'generic', signalType: 'generic', confidence: 0.5, rawData: { body: 'Unusual event.' }, timestamp: new Date() }]);
      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(r.isCrisis).toBe(false);
    });

    it('should handle AI failure gracefully', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI down'));
      const r = await analyzeSignals([{ source: 'generic', signalType: 'generic', confidence: 0.5, rawData: { body: 'Something.' }, timestamp: new Date() }]);
      expect(r.isCrisis).toBe(false);
    });
  });

  describe('Crisis CRUD and Acknowledgment', () => {
    it('should create crisis event with escalation chain', async () => {
      const c = await createCrisisEvent('user-1', 'entity-1', 'LEGAL_THREAT', 'HIGH', 'Lawsuit', 'Threat received');
      expect(c.id).toBeDefined();
      expect(c.status).toBe('DETECTED');
      expect(c.escalationChain.length).toBeGreaterThan(0);
      expect(c.warRoom.isActive).toBe(false);
    });

    it('should retrieve active crises', async () => {
      const c = await createCrisisEvent('user-active', 'entity-1', 'LEGAL_THREAT', 'HIGH', 'Active', 'desc');
      const actives = await getActiveCrises('user-active');
      expect(actives.some((x) => x.id === c.id)).toBe(true);
    });

    it('should get crisis by ID', async () => {
      const c = await createCrisisEvent('user-get', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Breach', 'desc');
      expect(getCrisisById(c.id)!.id).toBe(c.id);
    });

    it('should return undefined for non-existent ID', () => { expect(getCrisisById('nope')).toBeUndefined(); });

    it('should update crisis status', async () => {
      const c = await createCrisisEvent('user-upd', 'entity-1', 'PR_ISSUE', 'MEDIUM', 'PR', 'desc');
      c.status = 'RESOLVED';
      updateCrisis(c);
      expect(getCrisisById(c.id)!.status).toBe('RESOLVED');
    });
  });

  describe('War Room Creation', () => {
    it('should activate war room with docs and comms', async () => {
      const c = await createCrisisEvent('user-wr', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Breach', 'Unauthorized access');
      const wr = await activateWarRoom(c.id);
      expect(wr.isActive).toBe(true);
      expect(wr.activatedAt).toBeInstanceOf(Date);
      expect(wr.draftedComms.length).toBeGreaterThan(0);
    });

    it('should use AI for stakeholder comms', async () => {
      const c = await createCrisisEvent('user-wr-ai', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'AI Test', 'desc');
      await activateWarRoom(c.id);
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('should fall back when AI fails', async () => {
      generateText.mockRejectedValueOnce(new Error('AI unavailable'));
      const c = await createCrisisEvent('user-wr-fb', 'entity-1', 'DATA_BREACH', 'HIGH', 'Fallback', 'desc');
      const wr = await activateWarRoom(c.id);
      expect(wr.draftedComms.length).toBeGreaterThan(0);
      expect(wr.draftedComms[0]).toContain('Fallback');
    });

    it('should throw for non-existent crisis', async () => {
      await expect(activateWarRoom('nonexistent')).rejects.toThrow('Crisis nonexistent not found');
    });

    it('should persist war room state', async () => {
      const c = await createCrisisEvent('user-wr-p', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Persist', 'desc');
      await activateWarRoom(c.id);
      expect(getCrisisById(c.id)!.warRoom.isActive).toBe(true);
    });

    it('should deactivate war room', async () => {
      const c = await createCrisisEvent('user-deact', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Deact', 'desc');
      await activateWarRoom(c.id);
      await deactivateWarRoom(c.id);
      expect((await getWarRoomState(c.id)).isActive).toBe(false);
    });

    it('should add document to war room', async () => {
      const c = await createCrisisEvent('user-doc', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Doc', 'desc');
      await activateWarRoom(c.id);
      const s = await addWarRoomDocument(c.id, 'new-doc');
      expect(s.surfacedDocuments).toContain('new-doc');
    });

    it('should not duplicate documents', async () => {
      const c = await createCrisisEvent('user-dup', 'entity-1', 'DATA_BREACH', 'CRITICAL', 'Dup', 'desc');
      await activateWarRoom(c.id);
      await addWarRoomDocument(c.id, 'uniq');
      const s = await addWarRoomDocument(c.id, 'uniq');
      expect(s.surfacedDocuments.filter((d) => d === 'uniq').length).toBe(1);
    });
  });

  describe("Dead Man's Switch", () => {
    it('should configure switch', async () => {
      const r = await configure('user-dms', { userId: 'user-dms', isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] });
      expect(r.isEnabled).toBe(true);
      expect(r.lastCheckIn).toBeInstanceOf(Date);
      expect(r.missedCheckIns).toBe(0);
    });

    it('should configure with protocols', async () => {
      const r = await configure('user-dms-p', { userId: 'user-dms-p', isEnabled: true, checkInIntervalHours: 12, triggerAfterMisses: 2, protocols: [{ order: 1, action: 'NOTIFY', contactName: 'EC', message: 'Alert', delayHoursAfterTrigger: 0 }] });
      expect(r.protocols).toHaveLength(1);
    });

    it('should reset on check-in', async () => {
      await configure('user-ci', { userId: 'user-ci', isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] });
      const r = await checkIn('user-ci');
      expect(r.missedCheckIns).toBe(0);
    });

    it('should throw check-in for unconfigured user', async () => {
      await expect(checkIn('user-unk')).rejects.toThrow('not configured');
    });

    it('should not trigger when disabled', async () => {
      await configure('user-dis', { userId: 'user-dis', isEnabled: false, checkInIntervalHours: 24, triggerAfterMisses: 1, protocols: [{ order: 1, action: 'NOTIFY', contactName: 'EC', message: 'm', delayHoursAfterTrigger: 0 }] });
      const r = await evaluateSwitch('user-dis');
      expect(r.triggered).toBe(false);
    });

    it('should not trigger when recently checked in', async () => {
      await configure('user-recent', { userId: 'user-recent', isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] });
      expect((await evaluateSwitch('user-recent')).triggered).toBe(false);
    });

    it('should return status', async () => {
      await configure('user-st', { userId: 'user-st', isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] });
      const s = await getStatus('user-st');
      expect(s.isEnabled).toBe(true);
    });

    it('should add protocol with auto order', async () => {
      await configure('user-ap', { userId: 'user-ap', isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] });
      const r = await addProtocol('user-ap', { action: 'SEND_EMAIL', contactName: 'Lawyer', message: 'Urgent', delayHoursAfterTrigger: 1 });
      expect(r.protocols[0].order).toBe(1);
    });

    it('should increment order for subsequent protocols', async () => {
      await configure('user-ap2', { userId: 'user-ap2', isEnabled: true, checkInIntervalHours: 24, triggerAfterMisses: 3, protocols: [] });
      await addProtocol('user-ap2', { action: 'NOTIFY', contactName: 'C1', message: 'm1', delayHoursAfterTrigger: 0 });
      const r = await addProtocol('user-ap2', { action: 'NOTIFY', contactName: 'C2', message: 'm2', delayHoursAfterTrigger: 1 });
      expect(r.protocols[1].order).toBe(2);
    });
  });

  describe('Escalation', () => {
    it('should return default chain for LEGAL_THREAT', () => {
      const chain = getEscalationChain('LEGAL_THREAT');
      expect(chain.crisisType).toBe('LEGAL_THREAT');
      expect(chain.steps[0].contactName).toBe('Legal Counsel');
    });

    it('should return chain for DATA_BREACH with 4+ steps', () => {
      expect(getEscalationChain('DATA_BREACH').steps.length).toBeGreaterThanOrEqual(4);
    });

    it('should override with custom chain', () => {
      setEscalationChain({ crisisType: 'LEGAL_THREAT', steps: [{ order: 1, contactName: 'Custom', contactMethod: 'SMS', escalateAfterMinutes: 5 }] });
      expect(getEscalationChain('LEGAL_THREAT').steps[0].contactName).toBe('Custom');
      // Restore
      setEscalationChain({ crisisType: 'LEGAL_THREAT', steps: [{ order: 1, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 15 }, { order: 2, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 30 }, { order: 3, contactName: 'Board Chair', contactMethod: 'EMAIL', escalateAfterMinutes: 60 }] });
    });

    it('should notify first step during escalation', async () => {
      const c = await createCrisisEvent('user-esc', 'entity-1', 'LEGAL_THREAT', 'HIGH', 'Test', 'desc');
      const steps = await executeEscalation(c.id);
      const notified = steps.find((s) => s.status === 'NOTIFIED');
      expect(notified).toBeDefined();
      expect(notified!.notifiedAt).toBeInstanceOf(Date);
    });

    it('should throw for non-existent crisis escalation', async () => {
      await expect(executeEscalation('nope')).rejects.toThrow('Crisis nope not found');
    });

    it('should acknowledge and skip remaining', async () => {
      const c = await createCrisisEvent('user-ack', 'entity-1', 'LEGAL_THREAT', 'HIGH', 'Ack', 'desc');
      await executeEscalation(c.id);
      const updated = await acknowledgeEscalation(c.id, 1);
      expect(updated.status).toBe('ACKNOWLEDGED');
      expect(updated.escalationChain.find((s) => s.order === 1)!.status).toBe('ACKNOWLEDGED');
    });

    it('should return escalation status', async () => {
      const c = await createCrisisEvent('user-es', 'entity-1', 'FINANCIAL_ANOMALY', 'HIGH', 'Finance', 'desc');
      const steps = await getEscalationStatus(c.id);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toHaveProperty('order');
    });
  });

  describe('Full Crisis Lifecycle', () => {
    it('should detect, create, war room, escalate, acknowledge', async () => {
      const detection = await analyzeSignals([{ source: 'security', signalType: 'alert', confidence: 0.9, rawData: { body: 'Unauthorized access detected. Data breach confirmed.' }, timestamp: new Date() }]);
      expect(detection.isCrisis).toBe(true);

      const crisis = await createCrisisEvent('user-lc', 'entity-1', detection.type!, 'CRITICAL', 'Production Breach', 'Unauthorized DB access');
      expect(crisis.status).toBe('DETECTED');

      const wr = await activateWarRoom(crisis.id);
      expect(wr.isActive).toBe(true);

      const steps = await executeEscalation(crisis.id);
      const notified = steps.find((s) => s.status === 'NOTIFIED');
      expect(notified).toBeDefined();

      const ack = await acknowledgeEscalation(crisis.id, notified!.order);
      expect(ack.status).toBe('ACKNOWLEDGED');
    });
  });
});
