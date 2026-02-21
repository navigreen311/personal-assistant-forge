/**
 * E2E Test: Voice System (VoiceForge)
 * Tests: personas -> campaigns -> scripts -> call history
 *
 * Services under test:
 * - persona-service.ts (createPersona, getPersona, listPersonas, validateConsentChain, generateWatermarkId)
 * - campaign-service.ts (checkStopConditions, updateStats, getNextContacts)
 * - script-engine.ts (validateScript, startExecution, advanceNode, evaluateBranch, generateScriptWithAI)
 */

// --- Infrastructure mocks ---

jest.mock('@/lib/ai', () => ({ generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable')), generateText: jest.fn().mockRejectedValue(new Error('AI unavailable')) }));

const mockPrisma = {
  document: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  call: { findMany: jest.fn() },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { createPersona, getPersona, listPersonas, validateConsentChain, generateWatermarkId } from '@/modules/voiceforge/services/persona-service';
import { checkStopConditions, updateStats, getNextContacts } from '@/modules/voiceforge/services/campaign-service';
import { validateScript, startExecution, advanceNode, evaluateBranch, generateScriptWithAI } from '@/modules/voiceforge/services/script-engine';
import type { Campaign, OutboundCallResult, CallScript, ScriptNode, ScriptBranch } from '@/modules/voiceforge/types';

const { generateJSON } = require('@/lib/ai') as { generateJSON: jest.Mock };

const basePersonaData = {
  entityId: 'entity-1', name: 'Sales Agent', description: 'Pro sales voice',
  voiceConfig: { provider: 'mock', voiceId: 'v1', speed: 1, pitch: 1, language: 'en-US' },
  personality: { defaultTone: 'WARM', formality: 7, empathy: 8, assertiveness: 5, humor: 3, vocabulary: 'MODERATE' as const },
  status: 'DRAFT' as const, consentChain: [],
};

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'campaign-1', entityId: 'entity-1', name: 'Test Campaign', description: 'Test',
    personaId: 'persona-1', scriptId: 'script-1', targetContactIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
    schedule: { startDate: new Date(), callWindowStart: '09:00', callWindowEnd: '17:00', timezone: 'America/Chicago', maxCallsPerDay: 100, retryAttempts: 2, retryDelayHours: 4 },
    stopConditions: [], status: 'ACTIVE',
    stats: { totalTargeted: 5, totalCalled: 0, totalConnected: 0, totalVoicemail: 0, totalNoAnswer: 0, totalInterested: 0, totalNotInterested: 0, averageSentiment: 0, averageDuration: 0, conversionRate: 0 },
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

describe('Voice System E2E', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('Voice Persona CRUD', () => {
    it('should create a persona', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({ id: 'p1', entityId: 'entity-1', content: JSON.stringify(basePersonaData), createdAt: new Date(), updatedAt: new Date() });
      const r = await createPersona(basePersonaData);
      expect(r.id).toBe('p1');
      expect(r.name).toBe('Sales Agent');
    });

    it('should get persona by ID', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'p1', entityId: 'entity-1', content: JSON.stringify(basePersonaData), createdAt: new Date(), updatedAt: new Date() });
      const r = await getPersona('p1');
      expect(r?.name).toBe('Sales Agent');
    });

    it('should return null for non-existent persona', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      expect(await getPersona('nope')).toBeNull();
    });

    it('should list personas for entity', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        { id: 'p1', entityId: 'entity-1', content: JSON.stringify({ ...basePersonaData, name: 'A1' }), createdAt: new Date(), updatedAt: new Date() },
        { id: 'p2', entityId: 'entity-1', content: JSON.stringify({ ...basePersonaData, name: 'A2' }), createdAt: new Date(), updatedAt: new Date() },
      ]);
      expect(await listPersonas('entity-1')).toHaveLength(2);
    });

    it('should generate unique watermark IDs', () => {
      const w1 = generateWatermarkId();
      const w2 = generateWatermarkId();
      expect(w1).toMatch(/^WM-/);
      expect(w1).not.toBe(w2);
    });

    describe('Consent Chain Validation', () => {
      it('should be valid when all GRANTED', async () => {
        (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'p1', entityId: 'entity-1', content: JSON.stringify({ ...basePersonaData, consentChain: [{ id: 'c1', grantedBy: 'u1', grantedAt: new Date(), scope: 'voice', status: 'GRANTED' }] }), createdAt: new Date(), updatedAt: new Date() });
        const r = await validateConsentChain('p1');
        expect(r.valid).toBe(true);
      });

      it('should be invalid when REVOKED', async () => {
        (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'p1', entityId: 'entity-1', content: JSON.stringify({ ...basePersonaData, consentChain: [{ id: 'c1', grantedBy: 'u1', grantedAt: new Date(), scope: 'voice', status: 'GRANTED' }, { id: 'c2', grantedBy: 'u2', grantedAt: new Date(), scope: 'recording', status: 'REVOKED', revokedAt: new Date() }] }), createdAt: new Date(), updatedAt: new Date() });
        const r = await validateConsentChain('p1');
        expect(r.valid).toBe(false);
        expect(r.issues.some((i) => i.includes('revoked'))).toBe(true);
      });

      it('should be invalid when EXPIRED', async () => {
        (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'p1', entityId: 'entity-1', content: JSON.stringify({ ...basePersonaData, consentChain: [{ id: 'c1', grantedBy: 'u1', grantedAt: new Date(), scope: 'voice', status: 'EXPIRED' }] }), createdAt: new Date(), updatedAt: new Date() });
        expect((await validateConsentChain('p1')).valid).toBe(false);
      });

      it('should be invalid when empty', async () => {
        (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'p1', entityId: 'entity-1', content: JSON.stringify({ ...basePersonaData, consentChain: [] }), createdAt: new Date(), updatedAt: new Date() });
        expect((await validateConsentChain('p1')).valid).toBe(false);
      });

      it('should be invalid for non-existent persona', async () => {
        (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
        expect((await validateConsentChain('nope')).valid).toBe(false);
      });
    });
  });

  describe('Campaign Management', () => {
    it('should not stop when no conditions met', () => {
      expect(checkStopConditions(makeCampaign({ stopConditions: [{ type: 'MAX_CALLS', threshold: 100 }], stats: { ...makeCampaign().stats, totalCalled: 5 } })).shouldStop).toBe(false);
    });

    it('should stop at MAX_CALLS', () => {
      const r = checkStopConditions(makeCampaign({ stopConditions: [{ type: 'MAX_CALLS', threshold: 10 }], stats: { ...makeCampaign().stats, totalCalled: 10 } }));
      expect(r.shouldStop).toBe(true);
      expect(r.reason).toContain('Max calls');
    });

    it('should stop at MAX_CONNECTS', () => {
      expect(checkStopConditions(makeCampaign({ stopConditions: [{ type: 'MAX_CONNECTS', threshold: 5 }], stats: { ...makeCampaign().stats, totalConnected: 5 } })).shouldStop).toBe(true);
    });

    it('should stop at CONVERSION_TARGET', () => {
      expect(checkStopConditions(makeCampaign({ stopConditions: [{ type: 'CONVERSION_TARGET', threshold: 0.5 }], stats: { ...makeCampaign().stats, conversionRate: 0.6 } })).shouldStop).toBe(true);
    });

    it('should stop at NEGATIVE_SENTIMENT', () => {
      expect(checkStopConditions(makeCampaign({ stopConditions: [{ type: 'NEGATIVE_SENTIMENT', threshold: 0.5 }], stats: { ...makeCampaign().stats, averageSentiment: -0.6 } })).shouldStop).toBe(true);
    });

    it('should update stats for CONNECTED', async () => {
      const c = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'campaign-1', entityId: 'entity-1', content: JSON.stringify({ name: c.name, description: c.description, personaId: c.personaId, scriptId: c.scriptId, targetContactIds: c.targetContactIds, schedule: c.schedule, stopConditions: c.stopConditions, status: c.status, stats: c.stats }), createdAt: new Date(), updatedAt: new Date() });
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({});
      const s = await updateStats('campaign-1', { callId: 'call-1', outcome: 'CONNECTED', duration: 120, voicemailDropped: false, commitmentsMade: [], actionItems: [], nextSteps: [], sentiment: 0.5, escalated: false });
      expect(s.totalCalled).toBe(1);
      expect(s.totalConnected).toBe(1);
    });

    it('should update stats for VOICEMAIL', async () => {
      const c = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'campaign-1', entityId: 'entity-1', content: JSON.stringify({ ...c, stats: c.stats }), createdAt: new Date(), updatedAt: new Date() });
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({});
      const s = await updateStats('campaign-1', { callId: 'call-2', outcome: 'VOICEMAIL', duration: 30, voicemailDropped: true, commitmentsMade: [], actionItems: [], nextSteps: [], sentiment: 0, escalated: false });
      expect(s.totalVoicemail).toBe(1);
    });

    it('should return uncalled contacts', async () => {
      const c = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'campaign-1', entityId: 'entity-1', content: JSON.stringify({ ...c, stats: c.stats }), createdAt: new Date(), updatedAt: new Date() });
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([{ contactId: 'c1' }, { contactId: 'c2' }]);
      expect(await getNextContacts('campaign-1', 10)).toEqual(['c3', 'c4', 'c5']);
    });

    it('should respect limit', async () => {
      const c = makeCampaign();
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'campaign-1', entityId: 'entity-1', content: JSON.stringify({ ...c, stats: c.stats }), createdAt: new Date(), updatedAt: new Date() });
      (mockPrisma.call.findMany as jest.Mock).mockResolvedValue([]);
      expect(await getNextContacts('campaign-1', 2)).toHaveLength(2);
    });

    it('should return empty for non-existent campaign', async () => {
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      expect(await getNextContacts('nope', 10)).toEqual([]);
    });
  });

  describe('Script Management', () => {
    it('should validate a valid script', () => {
      const script: CallScript = { id: 's1', entityId: 'entity-1', name: 'Test', description: '', startNodeId: 'n1', version: 1, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), nodes: [{ id: 'n1', type: 'SPEAK', content: 'Hello', branches: [], nextNodeId: 'n2' }, { id: 'n2', type: 'END', content: 'Bye', branches: [] }] };
      expect(validateScript(script).valid).toBe(true);
    });

    it('should fail for missing startNodeId', () => {
      const script: CallScript = { id: 's1', entityId: 'entity-1', name: 'T', description: '', startNodeId: '', version: 1, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), nodes: [{ id: 'n1', type: 'SPEAK', content: 'Hi', branches: [] }] };
      expect(validateScript(script).valid).toBe(false);
    });

    it('should fail for non-existent startNodeId', () => {
      const script: CallScript = { id: 's1', entityId: 'entity-1', name: 'T', description: '', startNodeId: 'nope', version: 1, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), nodes: [{ id: 'n1', type: 'SPEAK', content: 'Hi', branches: [] }] };
      expect(validateScript(script).errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('should detect unreachable nodes', () => {
      const script: CallScript = { id: 's1', entityId: 'entity-1', name: 'T', description: '', startNodeId: 'n1', version: 1, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), nodes: [{ id: 'n1', type: 'SPEAK', content: 'Hi', branches: [] }, { id: 'n2', type: 'END', content: 'Unreachable', branches: [] }] };
      expect(validateScript(script).errors.some((e) => e.includes('unreachable'))).toBe(true);
    });

    it('should fail for empty nodes', () => {
      const script: CallScript = { id: 's1', entityId: 'entity-1', name: 'T', description: '', startNodeId: 'n1', version: 1, status: 'DRAFT', createdAt: new Date(), updatedAt: new Date(), nodes: [] };
      expect(validateScript(script).errors.some((e) => e.includes('no nodes'))).toBe(true);
    });

    it('should initialize execution at start node', () => {
      const e = startExecution('s1', 'c1', 'start');
      expect(e.currentNodeId).toBe('start');
      expect(e.visitedNodes).toEqual(['start']);
      expect(e.collectedData).toEqual({});
    });

    const nodes: ScriptNode[] = [
      { id: 'n1', type: 'SPEAK', content: 'Hello', branches: [{ condition: 'keyword=interested', targetNodeId: 'n2', label: 'Interested' }, { condition: 'keyword=cancel', targetNodeId: 'n3', label: 'Cancel' }], nextNodeId: 'n4' },
      { id: 'n2', type: 'SPEAK', content: 'Great!', branches: [], nextNodeId: 'n4' },
      { id: 'n3', type: 'END', content: 'Bye', branches: [] },
      { id: 'n4', type: 'COLLECT_INFO', content: 'Email?', collectField: 'email', branches: [], nextNodeId: 'n3' },
    ];

    it('should advance via branch on match', () => {
      expect(advanceNode(startExecution('s', 'c', 'n1'), 'I am interested', nodes).currentNodeId).toBe('n2');
    });

    it('should advance via cancel branch', () => {
      expect(advanceNode(startExecution('s', 'c', 'n1'), 'I want to cancel', nodes).currentNodeId).toBe('n3');
    });

    it('should fall through to nextNodeId', () => {
      expect(advanceNode(startExecution('s', 'c', 'n1'), 'tell me more', nodes).currentNodeId).toBe('n4');
    });

    it('should collect data on COLLECT_INFO', () => {
      const r = advanceNode(startExecution('s', 'c', 'n4'), 'john@example.com', nodes);
      expect(r.collectedData['email']).toBe('john@example.com');
      expect(r.currentNodeId).toBe('n3');
    });

    it('should match keyword branch conditions', () => {
      const b: ScriptBranch = { condition: 'keyword=yes', targetNodeId: 'n2', label: 'Yes' };
      expect(evaluateBranch(b, 'yes I agree', {})).toBe(true);
      expect(evaluateBranch(b, 'no thanks', {})).toBe(false);
    });

    it('should match intent conditions', () => {
      const b: ScriptBranch = { condition: 'intent=support', targetNodeId: 'n2', label: 'Support' };
      expect(evaluateBranch(b, 'I need support', {})).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(evaluateBranch({ condition: 'keyword=help', targetNodeId: 'n', label: 'H' }, 'HELP me', {})).toBe(true);
    });

    it('should evaluate context conditions', () => {
      const b: ScriptBranch = { condition: 'department=sales', targetNodeId: 'n', label: 'S' };
      expect(evaluateBranch(b, '', { department: 'sales' })).toBe(true);
      expect(evaluateBranch(b, '', { department: 'support' })).toBe(false);
    });

    describe('AI Script Generation', () => {
      beforeEach(() => { generateJSON.mockReset(); });

      it('should generate script with AI', async () => {
        generateJSON.mockResolvedValueOnce({ name: 'Sales Follow-up', description: 'Follow-up', nodes: [{ id: 'g', type: 'GREETING', content: 'Hello!', branches: [] }, { id: 'c', type: 'CLOSING', content: 'Thanks', branches: [] }], startNodeId: 'g' });
        const r = await generateScriptWithAI('entity-1', { purpose: 'sales', targetAudience: 'customers', tone: 'friendly', maxDuration: 5, keyPoints: ['upsell'] });
        expect(r.name).toBe('Sales Follow-up');
        expect(r.status).toBe('DRAFT');
      });

      it('should include branching in generated script', async () => {
        generateJSON.mockResolvedValueOnce({ name: 'Branch', description: 'B', nodes: [{ id: 's', type: 'GREETING', content: 'Hi', branches: [{ condition: 'i', targetNodeId: 'p' }, { condition: 'n', targetNodeId: 'e' }] }, { id: 'p', type: 'STATEMENT', content: 'P', branches: [] }, { id: 'e', type: 'CLOSING', content: 'E', branches: [] }], startNodeId: 's' });
        const r = await generateScriptWithAI('entity-1', { purpose: 'sales', targetAudience: 'prospects', tone: 'pro', maxDuration: 5, keyPoints: ['pitch'] });
        expect(r.nodes[0].branches.length).toBe(2);
      });

      it('should respect compliance requirements', async () => {
        generateJSON.mockResolvedValueOnce({ name: 'HIPAA', description: 'H', nodes: [{ id: 'n', type: 'GREETING', content: 'Hi', branches: [] }], startNodeId: 'n' });
        await generateScriptWithAI('entity-1', { purpose: 'healthcare', targetAudience: 'patients', tone: 'empathetic', maxDuration: 5, keyPoints: ['follow-up'], complianceRequirements: ['HIPAA', 'patient consent'] });
        const args = generateJSON.mock.calls[0][0] as string;
        expect(args).toContain('HIPAA');
        expect(args).toContain('patient consent');
      });
    });
  });

  describe('Call History', () => {
    it('should track outcomes across multiple calls', async () => {
      const c = makeCampaign();
      const doc = { id: 'ch', entityId: 'entity-1', content: JSON.stringify({ name: c.name, description: c.description, personaId: c.personaId, scriptId: c.scriptId, targetContactIds: c.targetContactIds, schedule: c.schedule, stopConditions: c.stopConditions, status: c.status, stats: c.stats }), createdAt: new Date(), updatedAt: new Date() };
      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue(doc);
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({});

      const s1 = await updateStats('ch', { callId: 'c1', outcome: 'CONNECTED', duration: 120, voicemailDropped: false, commitmentsMade: [], actionItems: [], nextSteps: [], sentiment: 0.5, escalated: false });
      expect(s1.totalCalled).toBe(1);
      expect(s1.totalConnected).toBe(1);

      (mockPrisma.document.findFirst as jest.Mock).mockResolvedValue({ ...doc, content: JSON.stringify({ ...JSON.parse(doc.content), stats: s1 }) });
      const s2 = await updateStats('ch', { callId: 'c2', outcome: 'VOICEMAIL', duration: 30, voicemailDropped: true, commitmentsMade: [], actionItems: [], nextSteps: [], sentiment: 0, escalated: false });
      expect(s2.totalCalled).toBe(2);
      expect(s2.totalVoicemail).toBe(1);
    });
  });

  describe('Full Voice Lifecycle', () => {
    it('should create persona, generate script, execute through nodes', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({ id: 'pl', entityId: 'entity-1', content: JSON.stringify(basePersonaData), createdAt: new Date(), updatedAt: new Date() });
      const persona = await createPersona(basePersonaData);
      expect(persona.id).toBe('pl');

      generateJSON.mockReset();
      // Note: generateScriptWithAI maps nodes and strips nextNodeId, so branches must be used for navigation
      generateJSON.mockResolvedValueOnce({ name: 'Lifecycle', description: 'E2E', nodes: [
        { id: 'g', type: 'SPEAK', content: 'Hello?', branches: [{ condition: 'keyword=interested', targetNodeId: 'p' }, { condition: 'keyword=cancel', targetNodeId: 'c' }] },
        { id: 'p', type: 'SPEAK', content: 'Great!', branches: [{ condition: 'keyword=good', targetNodeId: 'c' }] },
        { id: 'c', type: 'END', content: 'Thanks', branches: [] },
      ], startNodeId: 'g' });

      const script = await generateScriptWithAI('entity-1', { purpose: 'sales', targetAudience: 'prospects', tone: 'friendly', maxDuration: 5, keyPoints: ['pitch'] });
      const e = startExecution((script as any).id, 'call-lc', script.startNodeId);
      expect(e.currentNodeId).toBe('g');

      const s1 = advanceNode(e, 'I am interested', script.nodes);
      expect(s1.currentNodeId).toBe('p');

      // 'sounds good' matches keyword=good on node p
      const s2 = advanceNode(s1, 'sounds good', script.nodes);
      expect(s2.currentNodeId).toBe('c');
    });
  });
});
