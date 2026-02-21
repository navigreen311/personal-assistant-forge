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

export function convertFormat(content: string, fromFormat: string, toFormat: string): string {
  const from = fromFormat.toLowerCase();
  const to = toFormat.toLowerCase();

  if (from === to) return content;

  if (from === 'markdown' && to === 'html') {
    return markdownToHtml(content);
  }
  if (from === 'html' && to === 'markdown') {
    return htmlToMarkdown(content);
  }
  if (from === 'html' && to === 'plaintext') {
    return htmlToPlaintext(content);
  }
  if (from === 'markdown' && to === 'plaintext') {
    return markdownToPlaintext(content);
  }

  console.warn(`Unrecognized format conversion: ${fromFormat} → ${toFormat}. Returning content unchanged.`);
  return content;
}

function markdownToHtml(md: string): string {
  let html = md;

  // Code blocks (fenced) — must come before inline processing
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Headings (h1-h6)
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic (bold first to avoid conflict)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Unordered list items
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>\n$1</ul>');

  // Paragraphs: wrap remaining non-empty, non-tag lines
  const lines = html.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed === '' ||
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('</ul') ||
      trimmed.startsWith('<li') ||
      trimmed.startsWith('<pre') ||
      trimmed.startsWith('</pre') ||
      trimmed.startsWith('<code') ||
      trimmed.startsWith('</code')
    ) {
      result.push(line);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }

  return result.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlToMarkdown(html: string): string {
  let md = html;

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1');

  // Bold and italic
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // Links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Inline code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```');

  // List items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1');

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n');

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode common entities
  md = decodeHtmlEntities(md);

  // Clean up extra blank lines
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

function htmlToPlaintext(html: string): string {
  let text = html;

  // Line breaks and block-level elements get newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');

  // Strip all HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common entities
  text = decodeHtmlEntities(text);

  // Clean up extra blank lines and whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function markdownToPlaintext(md: string): string {
  let text = md;

  // Remove code blocks (fenced)
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```\w*\n?/g, '').replace(/```/g, '');
  });

  // Remove headings syntax
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic markers
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/\*(.+?)\*/g, '$1');

  // Remove inline code backticks
  text = text.replace(/`([^`]+)`/g, '$1');

  // Convert links [text](url) to just "text"
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove list markers
  text = text.replace(/^[-*]\s+/gm, '');

  return text.trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
