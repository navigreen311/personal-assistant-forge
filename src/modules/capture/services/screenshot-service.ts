// ============================================================================
// Screenshot Intelligence Service
// Extracts actionable data from screenshots and clipboard content.
// Uses pattern-based extraction for emails, phones, dates, URLs, action verbs.
// Stores screenshot metadata in Prisma Document model.
// ============================================================================

import type { SuggestedAction } from '@/modules/capture/types';
import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';

class ScreenshotService {
  async analyzeScreenshot(imageData: string, entityId?: string): Promise<{
    documentId: string;
    extractedText: string;
    suggestedActions: SuggestedAction[];
  }> {
    // In production, OCR would extract text from imageData first.
    // For now, treat imageData as already-extracted text.
    const extractedText = imageData;
    const suggestedActions = this.extractActions(extractedText);

    // Store screenshot metadata
    const doc = await prisma.document.create({
      data: {
        title: `Screenshot ${new Date().toISOString()}`,
        entityId: entityId ?? '',
        type: 'SCREENSHOT',
        content: extractedText.substring(0, 5000),
        metadata: {
          capturedAt: new Date().toISOString(),
          suggestedActions: suggestedActions.map(a => ({ type: a.type, confidence: a.confidence })),
        },
        status: 'DRAFT',
      },
    });

    return { documentId: doc.id, extractedText, suggestedActions };
  }

  async analyzeScreenshotWithAI(text: string): Promise<SuggestedAction[]> {
    try {
      const result = await generateJSON<{ actions: SuggestedAction[] }>(
        `Analyze this text captured from a screenshot and suggest actions.

Text: "${text.substring(0, 2000)}"

Return JSON with "actions" array. Each action has: type (CREATE_CONTACT, CREATE_TASK, CREATE_EVENT, ADD_NOTE), data (object with relevant fields), confidence (0-1).`,
        {
          maxTokens: 512,
          temperature: 0.3,
          system: 'You are a screenshot analysis assistant. Identify actionable items from captured text.',
        },
      );
      return result.actions ?? [];
    } catch {
      return this.extractActions(text);
    }
  }

  async extractFromClipboard(clipboardContent: string): Promise<SuggestedAction[]> {
    // Try AI-enhanced extraction first, fall back to regex
    try {
      return await this.analyzeScreenshotWithAI(clipboardContent);
    } catch {
      return this.extractActions(clipboardContent);
    }
  }

  private extractActions(text: string): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    // Extract email addresses -> CREATE_CONTACT
    const emailPattern = /[\w.+-]+@[\w.-]+\.\w+/g;
    let emailMatch: RegExpExecArray | null;
    const emailRe = new RegExp(emailPattern.source, emailPattern.flags);
    while ((emailMatch = emailRe.exec(text)) !== null) {
      actions.push({
        type: 'CREATE_CONTACT',
        data: { email: emailMatch[0] },
        confidence: 0.8,
      });
    }

    // Extract phone numbers -> CREATE_CONTACT
    const phonePattern = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    let phoneMatch: RegExpExecArray | null;
    const phoneRe = new RegExp(phonePattern.source, phonePattern.flags);
    while ((phoneMatch = phoneRe.exec(text)) !== null) {
      actions.push({
        type: 'CREATE_CONTACT',
        data: { phone: phoneMatch[0] },
        confidence: 0.7,
      });
    }

    // Detect action items -> CREATE_TASK
    const actionPatterns = [
      /(?:need to|must|should|have to|todo|action required|follow up|deadline)\s*[:\-]?\s*(.{10,80})/gi,
    ];
    for (const pattern of actionPatterns) {
      let actionMatch: RegExpExecArray | null;
      const actionRe = new RegExp(pattern.source, pattern.flags);
      while ((actionMatch = actionRe.exec(text)) !== null) {
        actions.push({
          type: 'CREATE_TASK',
          data: { title: actionMatch[1].trim() },
          confidence: 0.6,
        });
      }
    }

    // Detect dates + context -> CREATE_EVENT
    const dateContextPattern = /(?:meeting|appointment|call|event|conference)\s+(?:on|at|for)\s+(.{5,50})/gi;
    let dateMatch: RegExpExecArray | null;
    const dateRe = new RegExp(dateContextPattern.source, dateContextPattern.flags);
    while ((dateMatch = dateRe.exec(text)) !== null) {
      actions.push({
        type: 'CREATE_EVENT',
        data: { description: dateMatch[0].trim() },
        confidence: 0.5,
      });
    }

    // URLs -> ADD_NOTE
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    let urlMatch: RegExpExecArray | null;
    const urlRe = new RegExp(urlPattern.source, urlPattern.flags);
    while ((urlMatch = urlRe.exec(text)) !== null) {
      actions.push({
        type: 'ADD_NOTE',
        data: { url: urlMatch[0] },
        confidence: 0.6,
      });
    }

    return actions;
  }
}

export const screenshotService = new ScreenshotService();
export { ScreenshotService };
