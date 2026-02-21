import {
  buildPhoneTree,
  getPhoneTree,
  updatePhoneTree,
} from '@/modules/crisis/services/phone-tree-service';
import type { PhoneTreeNode, CrisisType } from '@/modules/crisis/types';

// Mock escalation service (used by buildPhoneTree to get escalation chain steps)
jest.mock('@/modules/crisis/services/escalation-service', () => ({
  getEscalationChain: jest.fn().mockImplementation((crisisType: CrisisType) => {
    const chains: Record<string, { crisisType: string; steps: { order: number; contactName: string; contactMethod: string; escalateAfterMinutes: number; contactId?: string }[] }> = {
      LEGAL_THREAT: {
        crisisType: 'LEGAL_THREAT',
        steps: [
          { order: 1, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
          { order: 2, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
          { order: 3, contactName: 'Board Chair', contactMethod: 'EMAIL', escalateAfterMinutes: 60 },
        ],
      },
      DATA_BREACH: {
        crisisType: 'DATA_BREACH',
        steps: [
          { order: 1, contactName: 'CTO', contactMethod: 'PHONE', escalateAfterMinutes: 5 },
          { order: 2, contactName: 'Security Team Lead', contactMethod: 'PHONE', escalateAfterMinutes: 10 },
          { order: 3, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 20, contactId: 'legal-1' },
          { order: 4, contactName: 'CEO', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
        ],
      },
      CLIENT_COMPLAINT: {
        crisisType: 'CLIENT_COMPLAINT',
        steps: [
          { order: 1, contactName: 'Account Manager', contactMethod: 'PHONE', escalateAfterMinutes: 15 },
        ],
      },
    };
    return chains[crisisType] ?? {
      crisisType,
      steps: [
        { order: 1, contactName: 'Default Contact', contactMethod: 'PHONE', escalateAfterMinutes: 30 },
      ],
    };
  }),
}));

describe('PhoneTreeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildPhoneTree', () => {
    it('should build a phone tree from escalation chain for LEGAL_THREAT', async () => {
      const tree = await buildPhoneTree('user-1', 'LEGAL_THREAT');

      expect(tree).toHaveLength(3);
      expect(tree[0].contactName).toBe('Legal Counsel');
      expect(tree[0].order).toBe(1);
      expect(tree[0].role).toBe('Primary');
    });

    it('should assign first node as Primary and second as Backup', async () => {
      const tree = await buildPhoneTree('user-2', 'LEGAL_THREAT');

      expect(tree[0].role).toBe('Primary');
      expect(tree[1].role).toBe('Backup');
    });

    it('should assign Legal role to contacts with "Legal" in their name', async () => {
      const tree = await buildPhoneTree('user-3', 'DATA_BREACH');

      // Third step is "Legal Counsel" (index 2, not Primary/Backup)
      const legalNode = tree.find(n => n.contactName === 'Legal Counsel');
      expect(legalNode).toBeDefined();
      expect(legalNode!.role).toBe('Legal');
    });

    it('should build hierarchy with first node as root having children', async () => {
      const tree = await buildPhoneTree('user-4', 'LEGAL_THREAT');

      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].contactName).toBe('CEO');
      expect(tree[0].children[1].contactName).toBe('Board Chair');
    });

    it('should generate phone numbers based on index', async () => {
      const tree = await buildPhoneTree('user-5', 'LEGAL_THREAT');

      expect(tree[0].phone).toBe('+1-555-0100');
      expect(tree[1].phone).toBe('+1-555-0101');
      expect(tree[2].phone).toBe('+1-555-0102');
    });

    it('should use contactId from chain step when provided', async () => {
      const tree = await buildPhoneTree('user-6', 'DATA_BREACH');

      const legalNode = tree.find(n => n.contactName === 'Legal Counsel');
      expect(legalNode!.contactId).toBe('legal-1');
    });

    it('should generate contactId when not provided in chain step', async () => {
      const tree = await buildPhoneTree('user-7', 'LEGAL_THREAT');

      // Legal Counsel has no contactId in mock, so it should be auto-generated
      expect(tree[0].contactId).toBe('contact-1');
      expect(tree[1].contactId).toBe('contact-2');
    });

    it('should handle a single-step escalation chain with no children', async () => {
      const tree = await buildPhoneTree('user-8', 'CLIENT_COMPLAINT');

      expect(tree).toHaveLength(1);
      expect(tree[0].contactName).toBe('Account Manager');
      expect(tree[0].children).toEqual([]);
    });
  });

  describe('getPhoneTree', () => {
    it('should return empty array for user with no phone tree', async () => {
      const tree = await getPhoneTree('unknown-user');

      expect(tree).toEqual([]);
    });

    it('should return the previously built phone tree', async () => {
      await buildPhoneTree('user-get-1', 'LEGAL_THREAT');

      const tree = await getPhoneTree('user-get-1');

      expect(tree).toHaveLength(3);
      expect(tree[0].contactName).toBe('Legal Counsel');
    });
  });

  describe('updatePhoneTree', () => {
    it('should store and retrieve a custom phone tree', async () => {
      const customTree: PhoneTreeNode[] = [
        {
          contactId: 'custom-1',
          contactName: 'Custom Contact',
          phone: '+1-555-9999',
          order: 1,
          role: 'Primary',
          children: [],
        },
      ];

      await updatePhoneTree('user-update-1', customTree);
      const retrieved = await getPhoneTree('user-update-1');

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].contactName).toBe('Custom Contact');
      expect(retrieved[0].phone).toBe('+1-555-9999');
    });

    it('should overwrite a previously built phone tree', async () => {
      await buildPhoneTree('user-update-2', 'LEGAL_THREAT');

      const newTree: PhoneTreeNode[] = [
        {
          contactId: 'replacement-1',
          contactName: 'Replacement Contact',
          phone: '+1-555-0000',
          order: 1,
          role: 'Primary',
          children: [],
        },
      ];

      await updatePhoneTree('user-update-2', newTree);
      const retrieved = await getPhoneTree('user-update-2');

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].contactName).toBe('Replacement Contact');
    });
  });
});
