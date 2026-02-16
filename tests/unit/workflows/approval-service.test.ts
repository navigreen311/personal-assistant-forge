// ============================================================================
// Approval Service — Unit Tests
// ============================================================================

import {
  requestApproval,
  submitApproval,
  getPendingApprovals,
  getApprovalStatus,
  clearApprovalStore,
} from '@/modules/workflows/services/approval-service';
import type { HumanApprovalNodeConfig } from '@/modules/workflows/types';

// --- Mocks ---

jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  },
}));

// --- Helpers ---

function createApprovalConfig(overrides?: Partial<HumanApprovalNodeConfig>): HumanApprovalNodeConfig {
  return {
    nodeType: 'HUMAN_APPROVAL',
    approverIds: ['user-1', 'user-2', 'user-3'],
    message: 'Please approve this action',
    timeoutHours: 24,
    requiredApprovals: 2,
    ...overrides,
  };
}

// --- Tests ---

describe('ApprovalService', () => {
  beforeEach(() => {
    clearApprovalStore();
    jest.clearAllMocks();
  });

  describe('requestApproval', () => {
    it('should create approval request with PENDING status', async () => {
      const config = createApprovalConfig();
      const result = await requestApproval(config, 'exec-1', {});

      expect(result.approvalId).toBeDefined();
      expect(result.status).toBe('PENDING');
    });

    it('should set expiration based on timeoutHours', async () => {
      const config = createApprovalConfig({ timeoutHours: 48 });
      const result = await requestApproval(config, 'exec-2', {});

      const status = await getApprovalStatus(result.approvalId);
      expect(status.status).toBe('PENDING');
    });
  });

  describe('submitApproval', () => {
    it('should record approval response', async () => {
      const config = createApprovalConfig();
      const { approvalId } = await requestApproval(config, 'exec-3', {});

      const result = await submitApproval(approvalId, 'user-1', true, 'Looks good');

      expect(result.status).toBe('PENDING'); // Still needs 1 more approval
    });

    it('should mark as APPROVED when required approvals met', async () => {
      const config = createApprovalConfig({ requiredApprovals: 2 });
      const { approvalId } = await requestApproval(config, 'exec-4', {});

      await submitApproval(approvalId, 'user-1', true);
      const result = await submitApproval(approvalId, 'user-2', true);

      expect(result.status).toBe('APPROVED');
    });

    it('should mark as REJECTED on rejection', async () => {
      const config = createApprovalConfig();
      const { approvalId } = await requestApproval(config, 'exec-5', {});

      const result = await submitApproval(approvalId, 'user-1', false, 'Not acceptable');

      expect(result.status).toBe('REJECTED');
    });

    it('should prevent duplicate responses from same approver', async () => {
      const config = createApprovalConfig();
      const { approvalId } = await requestApproval(config, 'exec-6', {});

      await submitApproval(approvalId, 'user-1', true);

      await expect(
        submitApproval(approvalId, 'user-1', true)
      ).rejects.toThrow('already responded');
    });

    it('should reject unauthorized approvers', async () => {
      const config = createApprovalConfig({ approverIds: ['user-1'] });
      const { approvalId } = await requestApproval(config, 'exec-7', {});

      await expect(
        submitApproval(approvalId, 'user-99', true)
      ).rejects.toThrow('not an authorized approver');
    });

    it('should not allow responses to non-pending approvals', async () => {
      const config = createApprovalConfig({ requiredApprovals: 1 });
      const { approvalId } = await requestApproval(config, 'exec-8', {});

      await submitApproval(approvalId, 'user-1', true); // Completes it

      await expect(
        submitApproval(approvalId, 'user-2', true)
      ).rejects.toThrow('no longer pending');
    });
  });

  describe('getApprovalStatus', () => {
    it('should return current approval progress', async () => {
      const config = createApprovalConfig({ requiredApprovals: 3 });
      const { approvalId } = await requestApproval(config, 'exec-9', {});

      await submitApproval(approvalId, 'user-1', true);

      const status = await getApprovalStatus(approvalId);

      expect(status.approvals).toBe(1);
      expect(status.required).toBe(3);
      expect(status.responses).toHaveLength(1);
    });

    it('should throw for non-existent approval', async () => {
      await expect(getApprovalStatus('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('getPendingApprovals', () => {
    it('should return only pending approvals for the user', async () => {
      const config = createApprovalConfig({
        approverIds: ['user-1', 'user-2'],
      });

      await requestApproval(config, 'exec-10', {}, 'Workflow A', 'Step 1');
      await requestApproval(config, 'exec-11', {}, 'Workflow B', 'Step 2');

      const pendingForUser1 = await getPendingApprovals('user-1');
      expect(pendingForUser1).toHaveLength(2);

      const pendingForUser99 = await getPendingApprovals('user-99');
      expect(pendingForUser99).toHaveLength(0);
    });

    it('should exclude expired approvals', async () => {
      const config = createApprovalConfig({ timeoutHours: 0 }); // Expires immediately

      await requestApproval(config, 'exec-12', {});

      // Wait a tick for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pending = await getPendingApprovals('user-1');
      // Should be 0 because timeoutHours=0 means expiresAt = createdAt
      expect(pending).toHaveLength(0);
    });
  });
});
