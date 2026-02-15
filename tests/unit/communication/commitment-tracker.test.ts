import { addCommitment, getOpenCommitments, markFulfilled, getOverdueCommitments } from '@/modules/communication/services/commitment-tracker';

jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'commitment-uuid-123'),
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('commitment-tracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addCommitment', () => {
    it('should add a commitment to a contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        commitments: [],
      });
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      const result = await addCommitment('c-1', {
        description: 'Deliver proposal by Friday',
        direction: 'TO',
        status: 'OPEN',
        dueDate: new Date('2026-03-01'),
      });

      expect(result.id).toBe('commitment-uuid-123');
      expect(result.description).toBe('Deliver proposal by Friday');
      expect(result.direction).toBe('TO');
      expect(result.status).toBe('OPEN');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(mockPrisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-1' } })
      );
    });

    it('should append to existing commitments', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        commitments: [{ id: 'existing-1', description: 'Old', direction: 'FROM', status: 'FULFILLED', createdAt: new Date() }],
      });
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      await addCommitment('c-1', {
        description: 'New commitment',
        direction: 'TO',
        status: 'OPEN',
      });

      const updateCall = (mockPrisma.contact.update as jest.Mock).mock.calls[0][0];
      const updatedCommitments = updateCall.data.commitments;
      expect(updatedCommitments).toHaveLength(2);
    });

    it('should throw for nonexistent contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        addCommitment('nonexistent', {
          description: 'Test',
          direction: 'TO',
          status: 'OPEN',
        })
      ).rejects.toThrow('Contact not found');
    });
  });

  describe('getOpenCommitments', () => {
    it('should return only OPEN commitments', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          commitments: [
            { id: '1', description: 'Open one', direction: 'TO', status: 'OPEN', createdAt: new Date() },
            { id: '2', description: 'Fulfilled', direction: 'TO', status: 'FULFILLED', createdAt: new Date() },
            { id: '3', description: 'Open two', direction: 'FROM', status: 'OPEN', createdAt: new Date() },
          ],
        },
      ]);

      const result = await getOpenCommitments('entity-1');
      expect(result).toHaveLength(2);
      expect(result.every((c) => c.status === 'OPEN')).toBe(true);
    });

    it('should filter by direction when specified', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          commitments: [
            { id: '1', description: 'To contact', direction: 'TO', status: 'OPEN', createdAt: new Date() },
            { id: '2', description: 'From contact', direction: 'FROM', status: 'OPEN', createdAt: new Date() },
          ],
        },
      ]);

      const result = await getOpenCommitments('entity-1', 'TO');
      expect(result).toHaveLength(1);
      expect(result[0].direction).toBe('TO');
    });

    it('should return empty array when no commitments', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { commitments: [] },
      ]);

      const result = await getOpenCommitments('entity-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('markFulfilled', () => {
    it('should mark a commitment as fulfilled', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          commitments: [
            { id: 'commit-1', description: 'Test', direction: 'TO', status: 'OPEN', createdAt: new Date() },
          ],
        },
      ]);
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      await markFulfilled('commit-1');

      const updateCall = (mockPrisma.contact.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.commitments[0].status).toBe('FULFILLED');
    });

    it('should throw for nonexistent commitment', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', commitments: [] },
      ]);

      await expect(markFulfilled('nonexistent')).rejects.toThrow('Commitment not found');
    });
  });

  describe('getOverdueCommitments', () => {
    it('should return commitments past due date', async () => {
      const pastDate = new Date('2025-01-01');
      const futureDate = new Date('2027-01-01');

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          commitments: [
            { id: '1', description: 'Overdue', direction: 'TO', status: 'OPEN', dueDate: pastDate, createdAt: new Date() },
            { id: '2', description: 'Not yet due', direction: 'TO', status: 'OPEN', dueDate: futureDate, createdAt: new Date() },
            { id: '3', description: 'Fulfilled past', direction: 'FROM', status: 'FULFILLED', dueDate: pastDate, createdAt: new Date() },
          ],
        },
      ]);

      const result = await getOverdueCommitments('entity-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array when nothing is overdue', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          commitments: [
            { id: '1', description: 'Future', direction: 'TO', status: 'OPEN', dueDate: new Date('2027-06-01'), createdAt: new Date() },
          ],
        },
      ]);

      const result = await getOverdueCommitments('entity-1');
      expect(result).toHaveLength(0);
    });
  });
});
