import { v4 as uuidv4 } from 'uuid';
import type { MockedDelegates } from '../../support/prisma-mock';

/** The row shape this fake stores and the service reads back. */
interface StoredRule {
  id: string;
  name: string;
  scope: string;
  entityId: string;
  condition: unknown;
  action: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The subset of a rule's columns the service supplies on create/update. */
type RuleInput = Partial<Omit<StoredRule, 'id' | 'createdAt' | 'updatedAt'>>;

// In-memory store for rules used by the mock
const ruleStore = new Map<string, StoredRule>();

/**
 * P-35: the delegate/method names in the literal below were unconstrained, and
 * the `mockImplementation` args were `any`. `MockedDelegates` binds the names
 * to the real client (see tests/support/prisma-mock.ts) and the arg types name
 * the fields this fake actually reads, so the mock states an interface instead
 * of asserting nothing.
 */
const mockPrisma: MockedDelegates<'rule' | 'actionLog'> = {
  rule: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  actionLog: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import {
  createPolicy,
  getPolicies,
  updatePolicy,
  deletePolicy,
  enforceRetentionPolicy,
  policyStore,
} from '@/modules/admin/services/org-policy-service';
import type { OrgPolicy } from '@/modules/admin/types';
import { verifiedEntityIdForTest } from '../../helpers/factories';

describe('OrgPolicyService', () => {
  beforeEach(() => {
    policyStore.clear();
    ruleStore.clear();
    jest.clearAllMocks();

    mockPrisma.rule.create!.mockImplementation(async ({ data }: { data: RuleInput }) => {
      const id = uuidv4();
      const now = new Date();
      const rule: StoredRule = {
        id,
        name: data.name ?? '',
        scope: data.scope ?? '',
        entityId: data.entityId ?? '',
        condition: data.condition,
        action: data.action,
        isActive: data.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      ruleStore.set(id, rule);
      return rule;
    });

    mockPrisma.rule.findMany!.mockImplementation(async ({ where }: { where?: Partial<StoredRule> }) => {
      const results: StoredRule[] = [];
      for (const [, rule] of ruleStore) {
        if (where?.scope && rule.scope !== where.scope) continue;
        if (where?.entityId && rule.entityId !== where.entityId) continue;
        results.push(rule);
      }
      return results;
    });

    mockPrisma.rule.findUnique!.mockImplementation(async ({ where }: { where: { id: string } }) => {
      return ruleStore.get(where.id) ?? null;
    });

    mockPrisma.rule.update!.mockImplementation(async ({ where, data }: { where: { id: string }; data: RuleInput }) => {
      const existing = ruleStore.get(where.id);
      if (!existing) throw new Error(`Rule ${where.id} not found`);
      const updated = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      if (data.condition !== undefined) updated.condition = data.condition;
      if (data.action !== undefined) updated.action = data.action;
      ruleStore.set(where.id, updated);
      return updated;
    });
  });

  describe('createPolicy', () => {
    it('should create a policy with generated ID and timestamps', async () => {
      const result = await createPolicy({
        entityId: verifiedEntityIdForTest('entity-1'),
        name: 'Data Retention',
        type: 'RETENTION',
        config: { retentionDays: 90 },
        isActive: true,
      });

      expect(result.id).toBeDefined();
      expect(result.entityId).toBe('entity-1');
      expect(result.name).toBe('Data Retention');
      expect(result.type).toBe('RETENTION');
      expect(result.isActive).toBe(true);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should store the policy in policyStore', async () => {
      const result = await createPolicy({
        entityId: verifiedEntityIdForTest('entity-1'),
        name: 'Access Policy',
        type: 'ACCESS',
        config: {},
        isActive: true,
      });

      expect(policyStore.get(result.id)).toBeDefined();
    });
  });

  describe('getPolicies', () => {
    it('should return all policies for an entity', async () => {
      await createPolicy({ entityId: verifiedEntityIdForTest('entity-1'), name: 'P1', type: 'RETENTION', config: {}, isActive: true });
      await createPolicy({ entityId: verifiedEntityIdForTest('entity-1'), name: 'P2', type: 'SHARING', config: {}, isActive: true });
      await createPolicy({ entityId: verifiedEntityIdForTest('entity-2'), name: 'P3', type: 'RETENTION', config: {}, isActive: true });

      const results = await getPolicies(verifiedEntityIdForTest('entity-1'));
      expect(results).toHaveLength(2);
    });

    it('should filter by type when provided', async () => {
      await createPolicy({ entityId: verifiedEntityIdForTest('entity-1'), name: 'P1', type: 'RETENTION', config: {}, isActive: true });
      await createPolicy({ entityId: verifiedEntityIdForTest('entity-1'), name: 'P2', type: 'SHARING', config: {}, isActive: true });

      const results = await getPolicies(verifiedEntityIdForTest('entity-1'), 'RETENTION');
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('RETENTION');
    });

    it('should return empty array when no policies match', async () => {
      const results = await getPolicies(verifiedEntityIdForTest('nonexistent'));
      expect(results).toEqual([]);
    });
  });

  describe('updatePolicy', () => {
    it('should update policy fields and set new updatedAt', async () => {
      const policy = await createPolicy({
        entityId: verifiedEntityIdForTest('entity-1'),
        name: 'Old Name',
        type: 'RETENTION',
        config: {},
        isActive: true,
      });
      const originalUpdatedAt = policy.updatedAt;

      const updated = await updatePolicy(policy.id, { name: 'New Name', isActive: false });

      expect(updated.name).toBe('New Name');
      expect(updated.isActive).toBe(false);
      expect(updated.id).toBe(policy.id);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    it('should throw for non-existent policy ID', async () => {
      await expect(updatePolicy('nonexistent', { name: 'X' })).rejects.toThrow(
        'Policy nonexistent not found'
      );
    });
  });

  describe('deletePolicy', () => {
    it('should remove the policy from the store', async () => {
      const policy = await createPolicy({
        entityId: verifiedEntityIdForTest('entity-1'),
        name: 'To Delete',
        type: 'DLP',
        config: {},
        isActive: true,
      });

      await deletePolicy(policy.id);
      expect(policyStore.has(policy.id)).toBe(false);
    });

    it('should throw for non-existent policy ID', async () => {
      await expect(deletePolicy('nonexistent')).rejects.toThrow(
        'Policy nonexistent not found'
      );
    });
  });

  describe('enforceRetentionPolicy', () => {
    it('should return deleted and retained counts when active retention policies exist', async () => {
      await createPolicy({
        entityId: verifiedEntityIdForTest('entity-1'),
        name: 'Retention',
        type: 'RETENTION',
        config: { retentionDays: 30 },
        isActive: true,
      });

      const result = await enforceRetentionPolicy(verifiedEntityIdForTest('entity-1'));
      expect(result.deletedRecords).toBe(42);
      expect(result.retainedRecords).toBe(1258);
    });

    it('should return zero deleted records when no active retention policies exist', async () => {
      const result = await enforceRetentionPolicy(verifiedEntityIdForTest('entity-no-policies'));
      expect(result.deletedRecords).toBe(0);
      expect(result.retainedRecords).toBe(1258);
    });
  });
});
