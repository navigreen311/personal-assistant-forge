// ============================================================================
// OCR / Document Scanning Service (Placeholder)
// Extracts text from images with structured parsing for business cards
// and receipts.
//
// Production integration points:
// - Tesseract.js: Client-side OCR, good for offline/privacy-first scenarios.
//   const worker = await createWorker('eng');
//   const { data: { text } } = await worker.recognize(image);
//
// - Google Cloud Vision API: High accuracy, supports 100+ languages.
//   const [result] = await visionClient.textDetection(imageBuffer);
//
// - AWS Textract: Best for structured documents (invoices, forms).
//   const response = await textract.analyzeDocument({ Document: { Bytes: buffer } });
//
// - Azure Computer Vision: Good balance of accuracy and cost.
//   const result = await client.read(imageUrl);
// ============================================================================

interface OCRResult {
  text: string;
  confidence: number;
  structuredData?: Record<string, string>;
}

interface BusinessCardResult {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
}

interface ReceiptResult {
  vendor?: string;
  amount?: number;
  date?: string;
  items?: string[];
}

class OCRService {
  async extractTextFromImage(
    imageData: string,
    type: 'BUSINESS_CARD' | 'RECEIPT' | 'WHITEBOARD' | 'GENERAL',
  ): Promise<OCRResult> {
    // Placeholder: Returns mock data based on type.
    // In production, this would send imageData to the chosen OCR provider.

    switch (type) {
      case 'BUSINESS_CARD':
        return {
          text: 'John Smith\nSenior Developer\nAcme Corp\njohn@acme.com\n(555) 123-4567',
          confidence: 0.92,
          structuredData: {
            name: 'John Smith',
            title: 'Senior Developer',
            company: 'Acme Corp',
            email: 'john@acme.com',
            phone: '(555) 123-4567',
          },
        };
      case 'RECEIPT':
        return {
          text: 'Office Depot\n02/15/2026\nPaper - $12.99\nPens - $8.50\nTotal: $21.49',
          confidence: 0.88,
          structuredData: {
            vendor: 'Office Depot',
            date: '2026-02-15',
            total: '21.49',
          },
        };
      case 'WHITEBOARD':
        return {
          text: 'Project timeline:\n- Phase 1: Feb\n- Phase 2: Mar\n- Launch: Apr',
          confidence: 0.75,
        };
      case 'GENERAL':
      default:
        return {
          text: imageData.substring(0, 200),
          confidence: 0.7,
        };
    }
  }

  async parseBusinessCard(ocrResult: string): Promise<BusinessCardResult> {
    // Placeholder: Pattern-based extraction from OCR text.
    // In production, use a specialized model or structured OCR output.
    const lines = ocrResult.split('\n').map((l) => l.trim()).filter(Boolean);
    const result: BusinessCardResult = {};

    for (const line of lines) {
      // Email
      const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        result.email = emailMatch[0];
        continue;
      }

      // Phone
      const phoneMatch = line.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        result.phone = phoneMatch[0];
        continue;
      }

      // Name (assume first line that isn't email/phone)
      if (!result.name && !line.includes('@') && !/\d{3}/.test(line)) {
        result.name = line;
        continue;
      }

      // Title or company (subsequent non-contact lines)
      if (result.name && !result.title && !line.includes('@') && !/\d{3}/.test(line)) {
        result.title = line;
        continue;
      }

      if (result.title && !result.company && !line.includes('@') && !/\d{3}/.test(line)) {
        result.company = line;
      }
    }

    return result;
  }

  async parseReceipt(ocrResult: string): Promise<ReceiptResult> {
    // Placeholder: Pattern-based extraction from receipt OCR text.
    const lines = ocrResult.split('\n').map((l) => l.trim()).filter(Boolean);
    const result: ReceiptResult = { items: [] };

    for (const line of lines) {
      // Total line
      const totalMatch = line.match(/total[:\s]*\$?([\d,]+\.?\d*)/i);
      if (totalMatch) {
        result.amount = parseFloat(totalMatch[1].replace(',', ''));
        continue;
      }

      // Date
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (dateMatch) {
        result.date = dateMatch[1];
        continue;
      }

      // Items with prices
      const itemMatch = line.match(/(.+?)\s*[-–]\s*\$?([\d,]+\.?\d*)/);
      if (itemMatch) {
        result.items?.push(itemMatch[1].trim());
        continue;
      }

      // Vendor (first line without $ or date)
      if (!result.vendor && !line.includes('$') && !/\d{1,2}\//.test(line)) {
        result.vendor = line;
      }
    }

    return result;
  }
}

export const ocrService = new OCRService();
export { OCRService };
