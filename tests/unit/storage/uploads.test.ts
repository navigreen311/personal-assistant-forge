import {
  validateFile,
  generateStorageKey,
  sanitizeFileName,
  calculateChecksum,
  scanForVirus,
  processUpload,
  DEFAULT_UPLOAD_CONFIG,
} from '@/lib/integrations/storage/uploads';

// Mock the storage client
jest.mock('@/lib/integrations/storage/client', () => ({
  uploadFile: jest.fn().mockResolvedValue('s3://paf-uploads/test-key'),
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed-url.example.com'),
  deleteFile: jest.fn().mockResolvedValue(undefined),
}));

describe('File Upload', () => {
  describe('validateFile', () => {
    it('should accept valid image files', () => {
      const result = validateFile({ name: 'photo.jpg', size: 1024, type: 'image/jpeg' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid PDF files', () => {
      const result = validateFile({ name: 'document.pdf', size: 5000, type: 'application/pdf' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject files exceeding 10MB', () => {
      const result = validateFile({
        name: 'large.jpg',
        size: 11 * 1024 * 1024,
        type: 'image/jpeg',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'size')).toBe(true);
    });

    it('should reject disallowed MIME types (e.g., application/exe)', () => {
      const result = validateFile({
        name: 'virus.exe',
        size: 1024,
        type: 'application/x-msdownload',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'mimeType')).toBe(true);
    });

    it('should reject disallowed extensions (e.g., .exe, .sh)', () => {
      const result = validateFile({
        name: 'script.sh',
        size: 512,
        type: 'text/plain', // mime type matches, but extension does not
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'extension')).toBe(true);
    });

    it('should use custom config when provided', () => {
      const result = validateFile(
        { name: 'small.jpg', size: 2048, type: 'image/jpeg' },
        { maxFileSizeBytes: 1024 }
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'size')).toBe(true);
    });
  });

  describe('generateStorageKey', () => {
    it('should produce key with entityId prefix', () => {
      const key = generateStorageKey({
        entityId: 'entity-123',
        category: 'documents',
        fileName: 'test.pdf',
      });
      expect(key.startsWith('entity-123/')).toBe(true);
    });

    it('should include category in path', () => {
      const key = generateStorageKey({
        entityId: 'entity-123',
        category: 'images',
        fileName: 'photo.jpg',
      });
      expect(key).toContain('/images/');
    });

    it('should include year/month directories', () => {
      const key = generateStorageKey({
        entityId: 'entity-123',
        category: 'documents',
        fileName: 'test.pdf',
      });
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      expect(key).toContain(`/${year}/${month}/`);
    });

    it('should include UUID for uniqueness', () => {
      const key1 = generateStorageKey({
        entityId: 'entity-123',
        category: 'documents',
        fileName: 'test.pdf',
      });
      const key2 = generateStorageKey({
        entityId: 'entity-123',
        category: 'documents',
        fileName: 'test.pdf',
      });
      expect(key1).not.toBe(key2);
    });

    it('should sanitize the filename in the key', () => {
      const key = generateStorageKey({
        entityId: 'entity-123',
        category: 'documents',
        fileName: '../../../etc/passwd',
      });
      expect(key).not.toContain('..');
      expect(key).not.toContain('/etc/passwd');
    });
  });

  describe('sanitizeFileName', () => {
    it('should remove path traversal sequences', () => {
      expect(sanitizeFileName('../../etc/passwd')).not.toContain('..');
      expect(sanitizeFileName('../../etc/passwd')).not.toContain('/');
    });

    it('should remove special characters', () => {
      const result = sanitizeFileName('file<name>with:special|chars?.txt');
      expect(result).not.toMatch(/[<>:|?]/);
      expect(result).toContain('.txt');
    });

    it('should preserve file extension', () => {
      const result = sanitizeFileName('document.pdf');
      expect(result).toContain('.pdf');
    });

    it('should limit filename length to 255 characters', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const result = sanitizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(255);
    });

    it('should handle filenames with spaces', () => {
      const result = sanitizeFileName('my document file.pdf');
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      // Spaces should be converted to underscores
      expect(result).not.toContain(' ');
    });
  });

  describe('calculateChecksum', () => {
    it('should return consistent SHA-256 hash for same content', async () => {
      const content = Buffer.from('hello world');
      const hash1 = await calculateChecksum(content);
      const hash2 = await calculateChecksum(content);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return different hashes for different content', async () => {
      const hash1 = await calculateChecksum(Buffer.from('hello'));
      const hash2 = await calculateChecksum(Buffer.from('world'));
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('scanForVirus', () => {
    it('should return clean: true (placeholder)', async () => {
      const result = await scanForVirus(Buffer.from('test content'));
      expect(result.clean).toBe(true);
      expect(result.threat).toBeUndefined();
    });
  });

  describe('processUpload', () => {
    const createMockFile = (content: string, name: string, type: string): File => {
      const blob = new Blob([content], { type });
      return new File([blob], name, { type });
    };

    it('should validate, scan, hash, and upload in sequence', async () => {
      const file = createMockFile('test content', 'test.pdf', 'application/pdf');
      const result = await processUpload({
        file,
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        entityId: 'entity-123',
        userId: 'user-123',
      });

      expect(result.key).toContain('entity-123/');
      expect(result.fileName).toBe('test.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.url).toBeDefined();
    });

    it('should return complete UploadResult', async () => {
      const file = createMockFile('hello', 'image.png', 'image/png');
      const result = await processUpload({
        file,
        fileName: 'image.png',
        mimeType: 'image/png',
        entityId: 'entity-456',
        userId: 'user-456',
        category: 'images',
      });

      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('fileName');
      expect(result).toHaveProperty('mimeType');
      expect(result).toHaveProperty('sizeBytes');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('checksum');
    });

    it('should reject invalid files before uploading', async () => {
      const file = createMockFile('bad', 'virus.exe', 'application/x-msdownload');
      await expect(
        processUpload({
          file,
          fileName: 'virus.exe',
          mimeType: 'application/x-msdownload',
          entityId: 'entity-123',
          userId: 'user-123',
        })
      ).rejects.toThrow('UPLOAD_VALIDATION_FAILED');
    });
  });
});
