import {
  createSignRequest,
  getSignStatus,
  cancelSignRequest,
  esignStore,
} from '@/modules/documents/services/esign-service';

describe('esign-service', () => {
  beforeEach(() => {
    esignStore.clear();
  });

  describe('createSignRequest', () => {
    it('creates a request with DRAFT status and signers with PENDING status', async () => {
      const signers = [
        { name: 'Alice', email: 'alice@example.com', order: 1 },
        { name: 'Bob', email: 'bob@example.com', order: 2 },
      ];

      const request = await createSignRequest('doc-1', signers);

      expect(request.id).toBeDefined();
      expect(request.documentId).toBe('doc-1');
      expect(request.status).toBe('DRAFT');
      expect(request.provider).toBe('docusign');
      expect(request.signers).toHaveLength(2);
      expect(request.signers[0].name).toBe('Alice');
      expect(request.signers[0].status).toBe('PENDING');
      expect(request.signers[1].name).toBe('Bob');
      expect(request.signers[1].status).toBe('PENDING');
      expect(request.createdAt).toBeInstanceOf(Date);
      expect(esignStore.has(request.id)).toBe(true);
    });

    it('accepts custom provider', async () => {
      const request = await createSignRequest(
        'doc-1',
        [{ name: 'Alice', email: 'alice@example.com', order: 1 }],
        'hellosign'
      );

      expect(request.provider).toBe('hellosign');
    });
  });

  describe('getSignStatus', () => {
    it('returns the request for known ID', async () => {
      const created = await createSignRequest('doc-1', [
        { name: 'Alice', email: 'alice@example.com', order: 1 },
      ]);

      const result = await getSignStatus(created.id);

      expect(result.id).toBe(created.id);
      expect(result.documentId).toBe('doc-1');
    });

    it('throws for unknown ID', async () => {
      await expect(getSignStatus('non-existent')).rejects.toThrow(
        'Sign request non-existent not found'
      );
    });
  });

  describe('cancelSignRequest', () => {
    it('sets status to CANCELLED', async () => {
      const created = await createSignRequest('doc-1', [
        { name: 'Alice', email: 'alice@example.com', order: 1 },
      ]);

      await cancelSignRequest(created.id);

      const result = await getSignStatus(created.id);
      expect(result.status).toBe('CANCELLED');
    });

    it('throws for unknown ID', async () => {
      await expect(cancelSignRequest('non-existent')).rejects.toThrow(
        'Sign request non-existent not found'
      );
    });
  });
});
