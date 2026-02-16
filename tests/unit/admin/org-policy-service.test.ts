import {
  createPolicy,
  getPolicies,
  updatePolicy,
  deletePolicy,
  enforceRetentionPolicy,
  policyStore,
} from '@/modules/admin/services/org-policy-service';
import type { OrgPolicy } from '@/modules/admin/types';

describe('OrgPolicyService', () => {
  beforeEach(() => {
    policyStore.clear();
  });

  describe('createPolicy', () => {
    it('should create a policy with generated ID and timestamps', async () => {
      const result = await createPolicy({
        entityId: 'entity-1',
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
        entityId: 'entity-1',
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
      await createPolicy({ entityId: 'entity-1', name: 'P1', type: 'RETENTION', config: {}, isActive: true });
      await createPolicy({ entityId: 'entity-1', name: 'P2', type: 'SHARING', config: {}, isActive: true });
      await createPolicy({ entityId: 'entity-2', name: 'P3', type: 'RETENTION', config: {}, isActive: true });

      const results = await getPolicies('entity-1');
      expect(results).toHaveLength(2);
    });

    it('should filter by type when provided', async () => {
      await createPolicy({ entityId: 'entity-1', name: 'P1', type: 'RETENTION', config: {}, isActive: true });
      await createPolicy({ entityId: 'entity-1', name: 'P2', type: 'SHARING', config: {}, isActive: true });

      const results = await getPolicies('entity-1', 'RETENTION');
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('RETENTION');
    });

    it('should return empty array when no policies match', async () => {
      const results = await getPolicies('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('updatePolicy', () => {
    it('should update policy fields and set new updatedAt', async () => {
      const policy = await createPolicy({
        entityId: 'entity-1',
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
        entityId: 'entity-1',
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
        entityId: 'entity-1',
        name: 'Retention',
        type: 'RETENTION',
        config: { retentionDays: 30 },
        isActive: true,
      });

      const result = await enforceRetentionPolicy('entity-1');
      expect(result.deletedRecords).toBe(42);
      expect(result.retainedRecords).toBe(1258);
    });

    it('should return zero deleted records when no active retention policies exist', async () => {
      const result = await enforceRetentionPolicy('entity-no-policies');
      expect(result.deletedRecords).toBe(0);
      expect(result.retainedRecords).toBe(1258);
    });
  });
});
