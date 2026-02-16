import { v4 as uuidv4 } from 'uuid';
import { generateText, generateJSON } from '@/lib/ai';
import type { Document, BrandKit, Citation } from '@/shared/types';
import type { DocumentGeneration } from '../types';
import { getTemplate } from './template-service';

export async function generateDocument(request: DocumentGeneration): Promise<Document> {
  const template = await getTemplate(request.templateId);
  if (!template) throw new Error(`Template ${request.templateId} not found`);

  let content = renderTemplate(template.content, request.variables);

  // AI-enhanced formatting and coherence
  try {
    content = await generateText(
      `Improve the formatting and coherence of this document while preserving all content and structure. Fix any awkward phrasing, ensure consistent formatting, and improve readability. Do not add new sections or remove existing content.

Document:
${content}`,
      { temperature: 0.6, maxTokens: 2048 }
    );
  } catch {
    // Keep template-rendered content on AI failure
  }

  if (request.brandKit) {
    content = applyBrandKit(content, request.brandKit);
  }

  const citations: Citation[] = [];
  if (request.citationsEnabled) {
    citations.push({
      id: uuidv4(),
      sourceType: 'DOCUMENT',
      sourceId: request.templateId,
      excerpt: `Generated from template: ${template.name}`,
    });

    // AI-generated citation recommendations
    try {
      const aiCitations = await generateJSON<{ citations: { claim: string; suggestedSource: string }[] }>(
        `Analyze this document and identify claims or statements that would benefit from citations or references.

Document:
${content}

Return JSON: { "citations": [{ "claim": "the claim text", "suggestedSource": "type of source that could support this" }] }
Limit to the top 5 most important claims.`,
        { temperature: 0.6, maxTokens: 512 }
      );

      if (aiCitations.citations && Array.isArray(aiCitations.citations)) {
        for (const c of aiCitations.citations) {
          citations.push({
            id: uuidv4(),
            sourceType: 'KNOWLEDGE',
            sourceId: 'ai-suggestion',
            excerpt: `${c.claim} — Suggested source: ${c.suggestedSource}`,
          });
        }
      }
    } catch {
      // Citation suggestions are optional
    }
  }

  const doc: Document = {
    id: uuidv4(),
    title: request.variables['title'] || template.name,
    entityId: request.entityId,
    type: template.type,
    version: 1,
    templateId: request.templateId,
    citations,
    content,
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return doc;
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export function applyBrandKit(content: string, brandKit: BrandKit): string {
  const header = brandKit.logoUrl
    ? `<div style="text-align:center;margin-bottom:20px"><img src="${brandKit.logoUrl}" alt="Logo" /></div>\n\n`
    : '';

  const style = `<style>
body { font-family: ${brandKit.fontFamily || 'Arial, sans-serif'}; color: ${brandKit.primaryColor}; }
h1, h2, h3 { color: ${brandKit.primaryColor}; }
a { color: ${brandKit.secondaryColor}; }
</style>\n\n`;

  return `${style}${header}${content}`;
}

export function convertFormat(content: string, _fromFormat: string, _toFormat: string): string {
  // Placeholder: returns content as-is for Markdown/HTML
  return content;
}
