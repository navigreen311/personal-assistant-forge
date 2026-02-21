jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
}));

import { OCRService } from '@/modules/capture/services/ocr-service';

const { generateText, generateJSON } = jest.requireMock('@/lib/ai') as {
  generateText: jest.Mock;
  generateJSON: jest.Mock;
};

describe('OCRService', () => {
  let service: OCRService;

  beforeEach(() => {
    service = new OCRService();
    jest.clearAllMocks();
  });

  describe('extractTextFromImage', () => {
    it('should use AI to enhance raw text input', async () => {
      // When imageData is plain text (not a data URI or URL),
      // it should delegate to enhanceOCRWithAI
      generateJSON.mockResolvedValueOnce({
        cleanedText: 'John Smith\njohn@acme.com',
        confidence: 0.9,
        structuredData: { name: 'John Smith', email: 'john@acme.com' },
      });

      const result = await service.extractTextFromImage(
        'John Smiht\njohn@acme.com',
        'BUSINESS_CARD',
      );

      expect(generateJSON).toHaveBeenCalled();
      expect(result.text).toBe('John Smith\njohn@acme.com');
      expect(result.confidence).toBe(0.9);
    });

    it('should return demo response for image data URIs without API key', async () => {
      const result = await service.extractTextFromImage(
        'data:image/png;base64,iVBORw0KGgoAAAANS...',
        'BUSINESS_CARD',
      );

      expect(result.text).toBe('[OCR: image processed]');
      expect(result.confidence).toBe(0.5);
    });

    it('should return demo response for URLs without API key', async () => {
      const result = await service.extractTextFromImage(
        'https://example.com/receipt.png',
        'RECEIPT',
      );

      expect(result.text).toBe('[OCR: image processed]');
      expect(result.confidence).toBe(0.5);
    });

    it('should return demo fallback for image data when no API key set', async () => {
      const result = await service.extractTextFromImage(
        'data:image/png;base64,abc123...',
        'GENERAL',
      );

      expect(result.text).toBe('[OCR: image processed]');
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('parseBusinessCard', () => {
    it('should extract name, email, phone from standard format', async () => {
      const result = await service.parseBusinessCard(
        'John Smith\nSenior Developer\nAcme Corp\njohn@acme.com\n(555) 123-4567',
      );

      expect(result.name).toBe('John Smith');
      expect(result.email).toBe('john@acme.com');
      expect(result.phone).toBe('(555) 123-4567');
    });

    it('should use AI fallback for incomplete regex results', async () => {
      // Text without a clear name pattern
      generateJSON.mockResolvedValueOnce({
        name: 'J. Smith',
        email: null,
        phone: null,
        company: 'Acme',
        title: 'CEO',
      });

      const result = await service.parseBusinessCard('J. Smith — CEO @ Acme');

      expect(generateJSON).toHaveBeenCalled();
      expect(result.name).toBe('J. Smith');
    });

    it('should handle cards with only email', async () => {
      // Has email but no name → should try AI fallback
      generateJSON.mockResolvedValueOnce({
        name: 'Support',
        email: 'support@acme.com',
      });

      const result = await service.parseBusinessCard('support@acme.com');

      // Regex finds email but no name, so AI fallback is used
      expect(generateJSON).toHaveBeenCalled();
    });

    it('should handle cards with only phone', async () => {
      // Has phone but no name → should try AI fallback
      generateJSON.mockResolvedValueOnce({
        name: 'Unknown',
        phone: '555-123-4567',
      });

      const result = await service.parseBusinessCard('555-123-4567');

      expect(generateJSON).toHaveBeenCalled();
    });

    it('should return regex result when name + email found', async () => {
      const result = await service.parseBusinessCard(
        'Jane Doe\njane@company.com',
      );

      expect(result.name).toBe('Jane Doe');
      expect(result.email).toBe('jane@company.com');
      // Should NOT call AI since regex found enough
      expect(generateJSON).not.toHaveBeenCalled();
    });

    it('should return regex result when name + phone found', async () => {
      const result = await service.parseBusinessCard(
        'Jane Doe\n(555) 987-6543',
      );

      expect(result.name).toBe('Jane Doe');
      expect(result.phone).toBe('(555) 987-6543');
      expect(generateJSON).not.toHaveBeenCalled();
    });

    it('should fall back to regex on AI failure', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      // No name detected by regex, no phone/email → incomplete
      const result = await service.parseBusinessCard('123 Main St');

      // AI failed, regex fallback returns what it can
      expect(result).toBeDefined();
    });
  });

  describe('parseReceipt', () => {
    it('should extract vendor, total, date, items', async () => {
      const result = await service.parseReceipt(
        'Office Depot\n02/15/2026\nPaper - $12.99\nPens - $8.50\nTotal: $21.49',
      );

      expect(result.vendor).toBe('Office Depot');
      expect(result.amount).toBe(21.49);
      expect(result.date).toBe('02/15/2026');
      expect(result.items).toContain('Paper');
      expect(result.items).toContain('Pens');
    });

    it('should use AI fallback for unusual receipt formats', async () => {
      // Receipt without a clear total → should trigger AI
      generateJSON.mockResolvedValueOnce({
        vendor: 'Cafe Milano',
        amount: 15.0,
        date: '2026-02-10',
        items: ['Latte', 'Croissant'],
      });

      const result = await service.parseReceipt(
        'Cafe Milano\nLatte 5.00\nCroissant 10.00',
      );

      expect(generateJSON).toHaveBeenCalled();
      expect(result.vendor).toBe('Cafe Milano');
      expect(result.amount).toBe(15.0);
    });

    it('should return regex result when vendor + total found', async () => {
      const result = await service.parseReceipt(
        'Amazon\nTotal: $99.99',
      );

      expect(result.vendor).toBe('Amazon');
      expect(result.amount).toBe(99.99);
      expect(generateJSON).not.toHaveBeenCalled();
    });
  });

  describe('enhanceOCRWithAI', () => {
    it('should call generateJSON with raw text and document type', async () => {
      generateJSON.mockResolvedValueOnce({
        cleanedText: 'Clean text',
        confidence: 0.85,
        structuredData: { key: 'value' },
      });

      await service.enhanceOCRWithAI('Raw OCR text', 'GENERAL');

      expect(generateJSON).toHaveBeenCalledWith(
        expect.stringContaining('GENERAL'),
        expect.objectContaining({ maxTokens: 512 }),
      );
    });

    it('should return cleaned text with structured data on success', async () => {
      generateJSON.mockResolvedValueOnce({
        cleanedText: 'Meeting notes: Q4 review',
        confidence: 0.9,
        structuredData: { topic: 'Q4 review' },
      });

      const result = await service.enhanceOCRWithAI('Meetng nots: Q4 revew', 'WHITEBOARD');

      expect(result.text).toBe('Meeting notes: Q4 review');
      expect(result.confidence).toBe(0.9);
      expect(result.structuredData).toEqual({ topic: 'Q4 review' });
    });

    it('should fallback to raw text on AI failure', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      const result = await service.enhanceOCRWithAI('Raw text here', 'GENERAL');

      expect(result.text).toBe('Raw text here');
      expect(result.confidence).toBe(0.5);
      expect(result.structuredData).toBeUndefined();
    });
  });
});
