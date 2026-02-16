import { v4 as uuidv4 } from 'uuid';
import type { Document, BrandKit, Citation } from '@/shared/types';
import type { DocumentGeneration } from '../types';
import { getTemplate } from './template-service';

export async function generateDocument(request: DocumentGeneration): Promise<Document> {
  const template = await getTemplate(request.templateId);
  if (!template) throw new Error(`Template ${request.templateId} not found`);

  let content = renderTemplate(template.content, request.variables);

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
