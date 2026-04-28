// VAFVision — client for VisionAudioForge document and screen analysis.
// Two endpoints:
//   - /vision/document  → structured document understanding (OCR + fields)
//   - /vision/screen    → UI element detection used by the page-map fallback

export interface DocumentAnalysisResult {
  type: 'invoice' | 'contract' | 'compliance' | 'medical' | 'general';
  extractedFields: Record<string, string>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  signatures: Array<{ present: boolean; signedBy?: string; date?: string }>;
  summary: string;
  compliance: {
    issues: string[];
    missingFields: string[];
    expirations: Array<{ field: string; date: string; isExpired: boolean }>;
  };
}

export interface ScreenElement {
  type: string;
  label: string;
  position: { x: number; y: number; width: number; height: number };
  state?: string;
  value?: string;
}

export interface ScreenAnalysisResult {
  elements: ScreenElement[];
  currentPage: string;
  activeModal?: string;
  errors: string[];
  suggestions: string[];
}

const VAF_BASE_URL = process.env.VAF_SERVICE_URL || 'http://localhost:4100';

export class VAFVision {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VAF_API_KEY || '';
  }

  // Analyze a document (PDF, image, scan).
  async analyzeDocument(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<DocumentAnalysisResult> {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(fileBuffer)], { type: mimeType })
    );

    const res = await fetch(`${VAF_BASE_URL}/api/v1/vision/document`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`VAF document analysis failed: ${res.status}`);
    }

    return (await res.json()) as DocumentAnalysisResult;
  }

  // Analyze a screenshot — used by the page-map vision fallback path.
  async analyzeScreen(screenshot: Buffer): Promise<ScreenAnalysisResult> {
    const formData = new FormData();
    formData.append(
      'image',
      new Blob([new Uint8Array(screenshot)], { type: 'image/png' })
    );

    const res = await fetch(`${VAF_BASE_URL}/api/v1/vision/screen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`VAF screen analysis failed: ${res.status}`);
    }

    return (await res.json()) as ScreenAnalysisResult;
  }
}
