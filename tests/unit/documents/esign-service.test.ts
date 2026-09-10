/**
 * T-018: e-signature requests used to live in an in-memory Map, so every
 * pending signature request vanished on restart. They are now rows in the
 * `ESignRequest` table P-00 landed for exactly this.
 *
 * ESignRequest has no entityId column (frozen schema), so the scope is proven
 * on the PARENT document -- tenancy-pattern.md sec.3. `esignStore` is gone because
 * the store is gone.
 */
jest.mock('@/lib/db', () => ({
  prisma: {
    eSignRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    document: {
      findFirst: jest.fn(),
    },
  },
}));

import {
  createSignRequest,
  getSignStatus,
  cancelSignRequest,
  listSignRequests,
} from '@/modules/documents/services/esign-service';
import { verifiedEntityIdForTest } from '../../helpers/factories';
import { prisma } from '@/lib/db';

const mockCreate = prisma.eSignRequest.create as jest.Mock;
const mockFindUnique = prisma.eSignRequest.findUnique as jest.Mock;
const mockFindMany = prisma.eSignRequest.findMany as jest.Mock;
const mockUpdateMany = prisma.eSignRequest.updateMany as jest.Mock;
const mockDocFindFirst = prisma.document.findFirst as jest.Mock;

const ENTITY_A = verifiedEntityIdForTest('entity-a');
const ENTITY_B = verifiedEntityIdForTest('entity-b');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    documentId: 'doc-1',
    signers: [{ name: 'Alice', email: 'alice@example.com', order: 1, status: 'PENDING' }],
    status: 'DRAFT',
    provider: 'docusign',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('esign-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default the parent document is in the caller's scope.
    mockDocFindFirst.mockResolvedValue({ id: 'doc-1' });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe('createSignRequest', () => {
    it('persists a request with DRAFT status and PENDING signers', async () => {
      const signers = [
        { name: 'Alice', email: 'alice@example.com', order: 1 },
        { name: 'Bob', email: 'bob@example.com', order: 2 },
      ];
      mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
        row({ ...data, id: 'req-1', createdAt: new Date() })
      );

      const request = await createSignRequest('doc-1', signers, ENTITY_A);

      expect(request.id).toBeDefined();
      expect(request.documentId).toBe('doc-1');
      expect(request.status).toBe('DRAFT');
      expect(request.provider).toBe('docusign');
      expect(request.signers).toHaveLength(2);
      expect(request.signers[0].status).toBe('PENDING');
      expect(request.signers[1].status).toBe('PENDING');
      expect(request.createdAt).toBeInstanceOf(Date);
      // It reached the database rather than a Map.
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('accepts a custom provider', async () => {
      mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
        row({ ...data, id: 'req-2', createdAt: new Date() })
      );

      const request = await createSignRequest(
        'doc-1',
        [{ name: 'Alice', email: 'alice@example.com', order: 1 }],
        ENTITY_A,
        'hellosign'
      );

      expect(request.provider).toBe('hellosign');
    });

    it("refuses a document outside the caller's entity, and writes nothing", async () => {
      mockDocFindFirst.mockResolvedValue(null);

      await expect(
        createSignRequest('doc-1', [{ name: 'A', email: 'a@x.test', order: 1 }], ENTITY_B)
      ).rejects.toThrow('not found');

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('getSignStatus', () => {
    it('returns the request for a known id in scope', async () => {
      mockFindUnique.mockResolvedValue(row());

      const result = await getSignStatus('req-1', ENTITY_A);

      expect(result.id).toBe('req-1');
      expect(result.documentId).toBe('doc-1');
    });

    it('throws for an unknown id', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(getSignStatus('non-existent', ENTITY_A)).rejects.toThrow(
        'Sign request non-existent not found'
      );
    });

    it("reports another tenant's request as not found, indistinguishably", async () => {
      mockFindUnique.mockResolvedValue(row());
      mockDocFindFirst.mockResolvedValue(null); // parent is not in scope

      await expect(getSignStatus('req-1', ENTITY_B)).rejects.toThrow(
        'Sign request req-1 not found'
      );
    });
  });

  describe('cancelSignRequest', () => {
    it('sets status to CANCELLED', async () => {
      mockFindUnique.mockResolvedValue(row());

      await cancelSignRequest('req-1', ENTITY_A);

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } })
      );
    });

    it('throws for an unknown id', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(cancelSignRequest('non-existent', ENTITY_A)).rejects.toThrow(
        'Sign request non-existent not found'
      );
    });

    it("refuses another tenant's request, and changes nothing", async () => {
      mockFindUnique.mockResolvedValue(row());
      mockDocFindFirst.mockResolvedValue(null);

      await expect(cancelSignRequest('req-1', ENTITY_B)).rejects.toThrow('not found');
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('listSignRequests', () => {
    it('lists the requests for a document in scope', async () => {
      mockFindMany.mockResolvedValue([row()]);

      const results = await listSignRequests('doc-1', ENTITY_A);

      expect(results).toHaveLength(1);
      expect(results[0].documentId).toBe('doc-1');
    });

    it("returns nothing for a document outside the caller's entity", async () => {
      mockDocFindFirst.mockResolvedValue(null);

      expect(await listSignRequests('doc-1', ENTITY_B)).toEqual([]);
      expect(mockFindMany).not.toHaveBeenCalled();
    });
  });
});
