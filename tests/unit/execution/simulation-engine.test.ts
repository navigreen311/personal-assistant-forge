// Mock uuid ESM module
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

// Mock Prisma client (transitive via cost-estimator)
jest.mock('../../../src/lib/db', () => ({
  __esModule: true,
  default: {
    actionLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

// Mock date-fns ESM module (transitive via cost-estimator)
jest.mock('date-fns', () => ({
  startOfDay: (d: Date) => d,
  endOfDay: (d: Date) => d,
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
  generateText: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

import {
  simulateAction,
  simulateMultipleActions,
  generateImpactReport,
} from '../../../src/modules/execution/services/simulation-engine';
import type { SimulationRequest } from '../../../src/modules/execution/types';

describe('SimulationEngine', () => {
  const defaultEntityId = 'entity-test-001';

  describe('simulateAction', () => {
    it('should simulate CREATE_TASK with correct effects', async () => {
      const request: SimulationRequest = {
        actionType: 'CREATE_TASK',
        target: 'tasks',
        parameters: { title: 'Write report', projectId: 'proj-1', assigneeId: 'user-1' },
        entityId: defaultEntityId,
      };

      const result = await simulateAction(request);

      expect(result.id).toBeDefined();
      expect(result.request).toEqual(request);
      expect(result.simulatedAt).toBeInstanceOf(Date);

      // Primary effect: CREATE Task
      expect(result.wouldDo).toHaveLength(1);
      expect(result.wouldDo[0].type).toBe('CREATE');
      expect(result.wouldDo[0].model).toBe('Task');
      expect(result.wouldDo[0].reversible).toBe(true);
      expect(result.wouldDo[0].description).toContain('Write report');

      // Side effects: project update + assignee notification
      expect(result.sideEffects).toHaveLength(2);
      expect(result.sideEffects[0].type).toBe('UPDATE');
      expect(result.sideEffects[0].model).toBe('Project');
      expect(result.sideEffects[1].type).toBe('NOTIFY');
      expect(result.sideEffects[1].model).toBe('User');

      // Should be reversible (CREATE is reversible)
      expect(result.reversible).toBe(true);

      // Blast radius and cost should be calculated
      expect(result.blastRadius).toBeDefined();
      expect(result.estimatedCost).toBeDefined();
    });

    it('should simulate CREATE_TASK with duplicate check warning', async () => {
      const result = await simulateAction({
        actionType: 'CREATE_TASK',
        target: 'tasks',
        parameters: { title: 'Test' },
        entityId: defaultEntityId,
      });

      // checkDuplicates is not set to false, so warning should appear
      expect(result.warnings).toContain(
        'Check for duplicate tasks with similar titles before creating.'
      );
    });

    it('should simulate CREATE_TASK without duplicate warning when opted out', async () => {
      const result = await simulateAction({
        actionType: 'CREATE_TASK',
        target: 'tasks',
        parameters: { title: 'Test', checkDuplicates: false },
        entityId: defaultEntityId,
      });

      expect(result.warnings).not.toContain(
        'Check for duplicate tasks with similar titles before creating.'
      );
    });

    it('should simulate SEND_MESSAGE with do-not-contact warning', async () => {
      const result = await simulateAction({
        actionType: 'SEND_MESSAGE',
        target: 'messages',
        parameters: {
          recipientId: 'user-1',
          channel: 'EMAIL',
          doNotContact: true,
        },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo).toHaveLength(1);
      expect(result.wouldDo[0].type).toBe('SEND');
      expect(result.wouldDo[0].model).toBe('Message');
      expect(result.wouldDo[0].reversible).toBe(false);

      // Side effect: message record creation
      expect(result.sideEffects).toHaveLength(1);
      expect(result.sideEffects[0].type).toBe('CREATE');

      // Warnings
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('do-not-contact'),
        ])
      );

      // Not reversible (sending is irreversible)
      expect(result.reversible).toBe(false);
    });

    it('should simulate SEND_MESSAGE with SMS cost warning', async () => {
      const result = await simulateAction({
        actionType: 'SEND_MESSAGE',
        target: 'messages',
        parameters: { recipientId: 'user-1', channel: 'SMS' },
        entityId: defaultEntityId,
      });

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('SMS'),
        ])
      );
    });

    it('should simulate SEND_MESSAGE with sensitivity warning', async () => {
      const result = await simulateAction({
        actionType: 'SEND_MESSAGE',
        target: 'messages',
        parameters: { recipientId: 'user-1', sensitivity: 'CONFIDENTIAL' },
        entityId: defaultEntityId,
      });

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('sensitive content'),
        ])
      );
    });

    it('should simulate DELETE_CONTACT with cascading side effects', async () => {
      const result = await simulateAction({
        actionType: 'DELETE_CONTACT',
        target: 'contacts/c-123',
        parameters: { contactId: 'c-123' },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo).toHaveLength(1);
      expect(result.wouldDo[0].type).toBe('DELETE');
      expect(result.wouldDo[0].model).toBe('Contact');
      expect(result.wouldDo[0].reversible).toBe(false);

      // Side effects: messages and calls lose references
      expect(result.sideEffects).toHaveLength(2);
      expect(result.sideEffects[0].model).toBe('Message');
      expect(result.sideEffects[1].model).toBe('Call');

      // Should have warnings about irreversibility
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('irreversible'),
        ])
      );

      expect(result.reversible).toBe(false);
    });

    it('should simulate DELETE_PROJECT with task unlinking side effect', async () => {
      const result = await simulateAction({
        actionType: 'DELETE_PROJECT',
        target: 'projects/p-1',
        parameters: { projectId: 'p-1' },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].type).toBe('DELETE');
      expect(result.wouldDo[0].model).toBe('Project');
      expect(result.sideEffects).toHaveLength(1);
      expect(result.sideEffects[0].model).toBe('Task');
      expect(result.sideEffects[0].description).toContain('unlinked');
    });

    it('should simulate DELETE_RECORD with dependencies', async () => {
      const result = await simulateAction({
        actionType: 'DELETE_RECORD',
        target: 'records/r-1',
        parameters: { recordId: 'r-1', model: 'Invoice', hasDependencies: true },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].type).toBe('DELETE');
      expect(result.wouldDo[0].model).toBe('Invoice');

      // Should have dependency side effect
      expect(result.sideEffects).toHaveLength(1);
      expect(result.sideEffects[0].model).toBe('DependentRecords');

      // Should warn about dependencies
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('dependent records'),
        ])
      );
    });

    it('should simulate UPDATE_RECORD with large change warning', async () => {
      const changes = {
        field1: 'a', field2: 'b', field3: 'c',
        field4: 'd', field5: 'e', field6: 'f',
      };
      const result = await simulateAction({
        actionType: 'UPDATE_RECORD',
        target: 'records/r-1',
        parameters: { recordId: 'r-1', model: 'Contact', changes },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].type).toBe('UPDATE');
      expect(result.wouldDo[0].model).toBe('Contact');
      expect(result.wouldDo[0].reversible).toBe(true);

      // Large change set warning (> 5 fields)
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Large number of field changes'),
        ])
      );
    });

    it('should simulate TRIGGER_WORKFLOW with step-based side effects', async () => {
      const result = await simulateAction({
        actionType: 'TRIGGER_WORKFLOW',
        target: 'workflows/wf-1',
        parameters: { workflowId: 'wf-1', stepCount: 7 },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].type).toBe('UPDATE');
      expect(result.wouldDo[0].model).toBe('Workflow');

      // Side effects: up to 5 ActionLog entries
      expect(result.sideEffects).toHaveLength(5);
      expect(result.sideEffects[0].model).toBe('ActionLog');

      // Warning for > 5 steps
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('7 steps'),
        ])
      );
    });

    it('should simulate FINANCIAL_ACTION with high-value warnings', async () => {
      const result = await simulateAction({
        actionType: 'FINANCIAL_ACTION',
        target: 'finance',
        parameters: { amount: 150000, type: 'payment' },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].type).toBe('CREATE');
      expect(result.wouldDo[0].model).toBe('FinancialRecord');
      expect(result.wouldDo[0].description).toContain('$150000');

      // Should have both threshold warnings
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('$150000'),
          expect.stringContaining('$100K threshold'),
        ])
      );
    });

    it('should simulate CREATE_CONTACT with no warnings', async () => {
      const result = await simulateAction({
        actionType: 'CREATE_CONTACT',
        target: 'contacts',
        parameters: { name: 'Alice' },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo).toHaveLength(1);
      expect(result.wouldDo[0].type).toBe('CREATE');
      expect(result.wouldDo[0].model).toBe('Contact');
      expect(result.sideEffects).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.reversible).toBe(true);
    });

    it('should simulate CREATE_PROJECT with no warnings', async () => {
      const result = await simulateAction({
        actionType: 'CREATE_PROJECT',
        target: 'projects',
        parameters: { name: 'New Project' },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].model).toBe('Project');
      expect(result.wouldDo[0].description).toContain('New Project');
      expect(result.reversible).toBe(true);
    });

    it('should simulate GENERATE_DOCUMENT with notification side effect', async () => {
      const result = await simulateAction({
        actionType: 'GENERATE_DOCUMENT',
        target: 'documents',
        parameters: { title: 'Monthly Report', type: 'REPORT' },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].model).toBe('Document');
      expect(result.wouldDo[0].description).toContain('Monthly Report');
      expect(result.sideEffects).toHaveLength(1);
      expect(result.sideEffects[0].type).toBe('NOTIFY');
    });

    it('should simulate CALL_API with irreversibility warning', async () => {
      const result = await simulateAction({
        actionType: 'CALL_API',
        target: 'api/endpoint',
        parameters: { endpoint: 'https://example.com/api' },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].type).toBe('SEND');
      expect(result.wouldDo[0].model).toBe('ExternalAPI');
      expect(result.wouldDo[0].reversible).toBe(false);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('cannot be reversed'),
        ])
      );
    });

    it('should simulate BULK_SEND with recipient count and critical warning', async () => {
      const result = await simulateAction({
        actionType: 'BULK_SEND',
        target: 'messages',
        parameters: { recipientCount: 150, channel: 'EMAIL' },
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].type).toBe('SEND');
      expect(result.wouldDo[0].description).toContain('150 recipients');
      expect(result.sideEffects).toHaveLength(1);
      expect(result.sideEffects[0].description).toContain('150 message records');

      // Critical warning for > 100 recipients
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('100 recipients'),
        ])
      );
    });

    it('should use generic simulator for unknown action types', async () => {
      const result = await simulateAction({
        actionType: 'CUSTOM_ACTION',
        target: 'custom/resource',
        parameters: {},
        entityId: defaultEntityId,
      });

      expect(result.wouldDo[0].type).toBe('UPDATE');
      expect(result.wouldDo[0].model).toBe('Unknown');
      expect(result.wouldDo[0].reversible).toBe(false);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Unknown action type'),
        ])
      );
    });

    it('should map recommendation based on blast radius', async () => {
      // LOW blast radius with no warnings -> SAFE_TO_EXECUTE
      const lowResult = await simulateAction({
        actionType: 'CREATE_CONTACT',
        target: 'contacts',
        parameters: { name: 'Test' },
        entityId: defaultEntityId,
      });
      expect(lowResult.recommendation).toBe('SAFE_TO_EXECUTE');

      // MEDIUM or actions with warnings -> REVIEW_RECOMMENDED
      const mediumResult = await simulateAction({
        actionType: 'FINANCIAL_ACTION',
        target: 'finance',
        parameters: { amount: 500 },
        entityId: defaultEntityId,
      });
      // FINANCIAL_ACTION has blast radius MEDIUM -> REVIEW_RECOMMENDED or HIGH_RISK
      expect(['REVIEW_RECOMMENDED', 'HIGH_RISK']).toContain(mediumResult.recommendation);
    });

    it('should calculate estimated cost from cost estimator', async () => {
      const result = await simulateAction({
        actionType: 'SEND_MESSAGE',
        target: 'messages',
        parameters: { channel: 'SMS', recipientId: 'user-1' },
        entityId: defaultEntityId,
      });

      // SMS costs $0.01
      expect(result.estimatedCost).toBe(0.01);
    });
  });

  describe('simulateMultipleActions', () => {
    it('should simulate multiple actions in parallel', async () => {
      const requests: SimulationRequest[] = [
        {
          actionType: 'CREATE_TASK',
          target: 'tasks',
          parameters: { title: 'Task 1' },
          entityId: defaultEntityId,
        },
        {
          actionType: 'SEND_MESSAGE',
          target: 'messages',
          parameters: { recipientId: 'user-1', channel: 'EMAIL' },
          entityId: defaultEntityId,
        },
        {
          actionType: 'DELETE_CONTACT',
          target: 'contacts/c-1',
          parameters: { contactId: 'c-1' },
          entityId: defaultEntityId,
        },
      ];

      const results = await simulateMultipleActions(requests);

      expect(results).toHaveLength(3);
      expect(results[0].request.actionType).toBe('CREATE_TASK');
      expect(results[1].request.actionType).toBe('SEND_MESSAGE');
      expect(results[2].request.actionType).toBe('DELETE_CONTACT');

      // Each result should have a unique ID
      const ids = results.map((r) => r.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('should return empty array for empty input', async () => {
      const results = await simulateMultipleActions([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('generateImpactReport', () => {
    it('should generate a human-readable report', async () => {
      const result = await simulateAction({
        actionType: 'SEND_MESSAGE',
        target: 'messages',
        parameters: { recipientId: 'user-1', channel: 'EMAIL' },
        entityId: defaultEntityId,
      });

      const report = generateImpactReport(result);

      expect(typeof report).toBe('string');
      expect(report).toContain('=== Impact Report ===');
      expect(report).toContain('Action: SEND_MESSAGE on messages');
      expect(report).toContain('Blast Radius:');
      expect(report).toContain('Reversible:');
      expect(report).toContain('Estimated Cost:');
      expect(report).toContain('Recommendation:');
      expect(report).toContain('--- What Would Happen');
      expect(report).toContain('[SEND]');
    });

    it('should include side effects section when present', async () => {
      const result = await simulateAction({
        actionType: 'DELETE_CONTACT',
        target: 'contacts/c-1',
        parameters: { contactId: 'c-1' },
        entityId: defaultEntityId,
      });

      const report = generateImpactReport(result);
      expect(report).toContain('--- Side Effects');
    });

    it('should include warnings section when present', async () => {
      const result = await simulateAction({
        actionType: 'CALL_API',
        target: 'api/endpoint',
        parameters: { endpoint: 'https://example.com' },
        entityId: defaultEntityId,
      });

      const report = generateImpactReport(result);
      expect(report).toContain('--- Warnings');
      expect(report).toContain('!');
    });

    it('should omit side effects section when empty', async () => {
      const result = await simulateAction({
        actionType: 'CREATE_CONTACT',
        target: 'contacts',
        parameters: { name: 'Test' },
        entityId: defaultEntityId,
      });

      const report = generateImpactReport(result);
      expect(report).not.toContain('--- Side Effects');
    });
  });

  describe('AI-powered side effect prediction', () => {
    const { generateJSON } = jest.requireMock('@/lib/ai') as { generateJSON: jest.Mock };

    beforeEach(() => {
      generateJSON.mockReset();
    });

    it('should call generateJSON for side effect prediction', async () => {
      generateJSON.mockResolvedValueOnce({
        additionalEffects: [
          { type: 'UPDATE', model: 'AuditLog', description: 'AI-predicted audit trail update', reversible: true },
        ],
        riskAssessment: 'Low risk action',
        recommendations: ['Consider batching similar tasks'],
      });

      const result = await simulateAction({
        actionType: 'CREATE_TASK',
        target: 'tasks',
        parameters: { title: 'AI test' },
        entityId: 'entity-test-001',
      });

      expect(generateJSON).toHaveBeenCalled();
      expect(result.sideEffects.some((e) => e.model === 'AuditLog')).toBe(true);
    });

    it('should merge AI effects with rule-based effects', async () => {
      generateJSON.mockResolvedValueOnce({
        additionalEffects: [
          { type: 'NOTIFY', model: 'Slack', description: 'Slack notification predicted', reversible: false },
        ],
        riskAssessment: 'Medium risk',
        recommendations: [],
      });

      const result = await simulateAction({
        actionType: 'CREATE_TASK',
        target: 'tasks',
        parameters: { title: 'Test', projectId: 'proj-1', assigneeId: 'user-1' },
        entityId: 'entity-test-001',
      });

      // Rule-based: 2 side effects (project update + assignee notification)
      // AI: 1 additional (Slack)
      expect(result.sideEffects.length).toBeGreaterThanOrEqual(3);
    });

    it('should proceed with rule-based results only when AI fails', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await simulateAction({
        actionType: 'CREATE_TASK',
        target: 'tasks',
        parameters: { title: 'Fallback test', projectId: 'proj-1' },
        entityId: 'entity-test-001',
      });

      expect(result.wouldDo).toHaveLength(1);
      expect(result.wouldDo[0].model).toBe('Task');
      // Rule-based side effects should still be present
      expect(result.sideEffects.some((e) => e.model === 'Project')).toBe(true);
    });

    it('should include AI risk assessment in result', async () => {
      generateJSON.mockResolvedValueOnce({
        additionalEffects: [],
        riskAssessment: 'This is a low-risk operation',
        recommendations: [],
      });

      const result = await simulateAction({
        actionType: 'CREATE_CONTACT',
        target: 'contacts',
        parameters: { name: 'Test' },
        entityId: 'entity-test-001',
      });

      expect((result as Record<string, unknown>).aiRiskAssessment).toBe('This is a low-risk operation');
    });
  });
});
