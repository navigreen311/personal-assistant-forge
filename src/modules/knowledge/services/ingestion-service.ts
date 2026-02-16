import { generateJSON, generateText } from '@/lib/ai';
import type { IngestionRequest, IngestionResult, CapturedEntry } from '@/modules/knowledge/types';
import { capture } from './capture-service';

const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
  'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
  'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has',
  'had', 'did', 'does', 'doing', 'being', 'having', 'each', 'every', 'both',
  'few', 'more', 'much', 'many', 'such', 'very', 'own', 'same', 'should',
]);

export function chunkContent(content: string, maxChunkSize: number = 2000): string[] {
  if (!content || !content.trim()) return [];
  if (content.length <= maxChunkSize) return [content.trim()];

  const chunks: string[] = [];

  // First, split on double newlines (paragraphs)
  const paragraphs = content.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChunkSize) {
      // Paragraph itself is too large, split on single newlines
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      const lines = trimmed.split(/\n/);
      for (const line of lines) {
        const lineTrimmed = line.trim();
        if (!lineTrimmed) continue;

        if (currentChunk.length + lineTrimmed.length + 1 > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          // If a single line is still too large, force-split it
          if (lineTrimmed.length > maxChunkSize) {
            for (let i = 0; i < lineTrimmed.length; i += maxChunkSize) {
              chunks.push(lineTrimmed.substring(i, i + maxChunkSize));
            }
            currentChunk = '';
          } else {
            currentChunk = lineTrimmed;
          }
        } else {
          currentChunk = currentChunk ? currentChunk + '\n' + lineTrimmed : lineTrimmed;
        }
      }
    } else if (currentChunk.length + trimmed.length + 2 > maxChunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = trimmed;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmed : trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export function extractKeywords(content: string): string[] {
  if (!content || !content.trim()) return [];

  const words = content
    .toLowerCase()
    .split(/[\s,.;:!?()\[\]{}"'`\-_/\\|@#$%^&*+=<>~]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

export function generateSummary(content: string): string {
  if (!content || !content.trim()) return '';

  // Extract first 3 sentences
  const sentences = content.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return content.substring(0, 200);

  return sentences.slice(0, 3).join(' ').trim();
}

async function classifyWithAI(content: string): Promise<{ tags: string[]; summary: string }> {
  try {
    const result = await generateJSON<{ tags: string[]; summary: string }>(
      `Analyze this document content and extract relevant classification tags and a summary.

Content (first 1000 chars): ${content.substring(0, 1000)}

Return:
- tags: 3-7 specific, descriptive tags for categorization (lowercase, single words or short phrases)
- summary: 2-3 sentence summary of the content`, {
        maxTokens: 256,
        temperature: 0.3,
        system: 'You are a document classifier. Extract precise, relevant tags and write concise summaries.',
      }
    );
    return {
      tags: result.tags || [],
      summary: result.summary || '',
    };
  } catch {
    return { tags: [], summary: '' };
  }
}

export async function ingestDocument(request: IngestionRequest): Promise<IngestionResult> {
  const chunks = chunkContent(request.content);
  const wordCount = request.content.split(/\s+/).filter(Boolean).length;

  // Use AI for classification and summarization, fall back to rule-based
  const aiClassification = await classifyWithAI(request.content);
  const keywords = aiClassification.tags.length > 0
    ? aiClassification.tags
    : extractKeywords(request.content);
  const summary = aiClassification.summary || generateSummary(request.content);

  const entries: CapturedEntry[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const entry = await capture({
      entityId: request.entityId,
      type: 'ARTICLE',
      content: chunks[i],
      title: `${request.filename} - Section ${i + 1}`,
      source: request.source,
      tags: keywords.slice(0, 5),
    });
    entries.push(entry);
  }

  return {
    entries,
    summary,
    extractedKeywords: keywords,
    wordCount,
  };
}
