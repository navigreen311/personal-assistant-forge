// ============================================================================
// Deep Research Agent Service (AI-Powered with Fallback)
// ============================================================================

import { generateJSON, generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type {
  ResearchRequest,
  ResearchReport,
  ResearchSource,
  ResearchFinding,
  DocumentAnalysis,
  SourceType,
  SourceQuality,
} from '@/modules/decisions/types';

/**
 * Extract meaningful keywords from a topic string for knowledge base queries.
 */
export function extractTopicKeywords(topic: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'for', 'and', 'nor', 'but',
    'or', 'yet', 'so', 'in', 'on', 'at', 'to', 'of', 'with', 'by', 'from',
    'this', 'that', 'these', 'those', 'it', 'its', 'not', 'no', 'what',
    'how', 'why', 'when', 'where', 'which', 'who', 'about', 'into',
  ]);

  return topic
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Conduct research using AI to produce contextual findings and summary.
 * Falls back to knowledge base lookup, then to context-aware generated data.
 */
export async function conductResearch(
  request: ResearchRequest
): Promise<ResearchReport> {
  try {
    return await conductResearchWithAI(request);
  } catch (error) {
    console.warn(
      `[ResearchAgent] AI research failed for query="${request.query}" ` +
      `entityId="${request.entityId}" depth="${request.depth}": ${error instanceof Error ? error.message : String(error)}`
    );

    // Attempt to query knowledge base for relevant entries
    const keywords = extractTopicKeywords(request.query);
    let sourceQuality: SourceQuality = 'generated';
    let sources: ResearchSource[];
    let findings: ResearchFinding[];

    try {
      const knowledgeEntries = await queryKnowledgeBase(request.entityId, keywords);

      if (knowledgeEntries.length > 0) {
        sourceQuality = 'knowledge-base';
        sources = knowledgeEntriesToSources(knowledgeEntries, request);
        findings = generateKnowledgeBaseFindings(knowledgeEntries, request, sources);
      } else {
        sources = generateContextAwareSources(request, keywords);
        findings = generateContextAwareFindings(request, sources, keywords);
      }
    } catch (dbError) {
      console.warn(
        `[ResearchAgent] Knowledge base query failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`
      );
      sources = generateContextAwareSources(request, keywords);
      findings = generateContextAwareFindings(request, sources, keywords);
    }

    return {
      id: `research-${Date.now()}`,
      query: request.query,
      summary: `Research summary for: "${request.query}". ` +
        `Depth: ${request.depth}. ${sources.length} sources consulted.` +
        (sourceQuality === 'knowledge-base'
          ? ' Sourced from internal knowledge base.'
          : ` Based on analysis of key topics: ${keywords.slice(0, 3).join(', ')}.`),
      findings,
      sources,
      confidenceScore: getDepthConfidence(request.depth) * (sourceQuality === 'knowledge-base' ? 0.9 : 0.6),
      sourceQuality,
      gaps: sourceQuality === 'knowledge-base'
        ? [
            'AI-powered deep analysis unavailable',
            'Knowledge base may not contain the latest external data',
            'Cross-referencing with external sources not performed',
          ]
        : [
            'AI-powered analysis unavailable',
            'No matching knowledge base entries found',
            `Generated findings based on topic keywords: ${keywords.slice(0, 5).join(', ')}`,
          ],
      createdAt: new Date(),
    };
  }
}

async function conductResearchWithAI(
  request: ResearchRequest
): Promise<ResearchReport> {
  const maxSources = Math.min(request.maxSources, 10);

  const result = await generateJSON<{
    sources: Array<{
      type: string;
      title: string;
      excerpt: string;
      url?: string;
    }>;
    findings: Array<{
      claim: string;
      evidence: string;
      confidence: number;
      sourceIndices: number[];
    }>;
    gaps: string[];
  }>(`Conduct research on the following topic and return structured findings.

Query: "${request.query}"
Research depth: ${request.depth}
Source types to consider: ${request.sourceTypes.join(', ')}
Entity: ${request.entityId}
Maximum sources: ${maxSources}

Generate:
- sources: ${maxSources} relevant sources with type (${request.sourceTypes.join('/')}), title, excerpt, and optional url
- findings: 2-5 key findings with claim, evidence, confidence (0-1), and sourceIndices (indices into sources array)
- gaps: 2-4 research gaps or limitations`, {
    maxTokens: 1536,
    temperature: 0.4,
    system: 'You are a research analyst. Generate realistic, well-structured research findings. Be specific and cite evidence. Findings should be actionable and relevant to business decisions.',
  });

  const now = new Date();
  const sources: ResearchSource[] = result.sources.map((s, i) => ({
    id: `source-${Date.now()}-${i}`,
    type: (request.sourceTypes.includes(s.type as SourceType) ? s.type : request.sourceTypes[0] || 'WEB') as SourceType,
    title: s.title,
    url: s.url,
    credibilityScore: evaluateSourceCredibility({
      type: s.type as SourceType,
      title: s.title,
      excerpt: s.excerpt,
      url: s.url,
    }),
    excerpt: s.excerpt,
    accessedAt: now,
  }));

  const findings: ResearchFinding[] = result.findings.map((f) => ({
    claim: f.claim,
    evidence: f.evidence,
    sourceIds: (f.sourceIndices || [])
      .filter((idx) => idx < sources.length)
      .map((idx) => sources[idx].id),
    confidence: f.confidence ?? getDepthConfidence(request.depth),
  }));

  const summary = await generateText(
    `Summarize these research findings in 2-3 sentences for a decision-maker.

Query: "${request.query}"
Findings:
${findings.map((f) => `- ${f.claim}: ${f.evidence}`).join('\n')}`,
    {
      maxTokens: 256,
      temperature: 0.3,
    }
  );

  return {
    id: `research-${Date.now()}`,
    query: request.query,
    summary,
    findings,
    sources,
    confidenceScore: getDepthConfidence(request.depth),
    sourceQuality: 'ai' as SourceQuality,
    gaps: result.gaps || [],
    createdAt: now,
  };
}

/**
 * Score source credibility from 0-1 based on type and attributes.
 */
export function evaluateSourceCredibility(
  source: Partial<ResearchSource>
): number {
  let score = 0.5;

  // Type-based scoring
  if (source.type === 'DOCUMENT') score += 0.2;
  else if (source.type === 'KNOWLEDGE') score += 0.3;
  else if (source.type === 'WEB') score += 0.0;

  // Has URL → slightly more verifiable
  if (source.url) score += 0.05;

  // Has title → more structured
  if (source.title && source.title.length > 5) score += 0.05;

  // Has excerpt → evidence present
  if (source.excerpt && source.excerpt.length > 20) score += 0.1;

  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}

/**
 * Analyze a document's content to extract key terms, risks, and obligations.
 * Placeholder implementation using simple heuristics.
 */
export async function analyzeDocument(
  content: string
): Promise<DocumentAnalysis> {
  const words = content.split(/\s+/);
  const keyTerms = extractKeyTerms(content);
  const risks = extractRisks(content);
  const obligations = extractObligations(content);

  return {
    keyTerms,
    risks,
    obligations,
    summary: words.length > 20
      ? words.slice(0, 20).join(' ') + '...'
      : content,
  };
}

// --- Internal Helpers ---

interface KnowledgeEntryRecord {
  id: string;
  content: string;
  tags: string[];
  entityId: string;
  source: string;
}

async function queryKnowledgeBase(
  entityId: string,
  keywords: string[]
): Promise<KnowledgeEntryRecord[]> {
  if (keywords.length === 0) return [];

  const orConditions = keywords.map((keyword) => ({
    content: { contains: keyword },
  }));

  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      entityId,
      OR: orConditions,
    },
    take: 5,
    orderBy: { updatedAt: 'desc' },
  });

  return entries as KnowledgeEntryRecord[];
}

function knowledgeEntriesToSources(
  entries: KnowledgeEntryRecord[],
  request: ResearchRequest
): ResearchSource[] {
  const now = new Date();
  return entries.map((entry, i) => ({
    id: `source-kb-${Date.now()}-${i}`,
    type: 'KNOWLEDGE' as SourceType,
    title: `Knowledge Base: ${entry.tags.length > 0 ? entry.tags.slice(0, 3).join(', ') : entry.source}`,
    credibilityScore: evaluateSourceCredibility({
      type: 'KNOWLEDGE' as SourceType,
      title: entry.source,
      excerpt: entry.content.slice(0, 200),
    }),
    excerpt: entry.content.length > 200
      ? entry.content.slice(0, 200) + '...'
      : entry.content,
    accessedAt: now,
  }));
}

function generateKnowledgeBaseFindings(
  entries: KnowledgeEntryRecord[],
  request: ResearchRequest,
  sources: ResearchSource[]
): ResearchFinding[] {
  const findings: ResearchFinding[] = [];

  for (let i = 0; i < Math.min(entries.length, 3); i++) {
    const entry = entries[i];
    const contentPreview = entry.content.length > 100
      ? entry.content.slice(0, 100) + '...'
      : entry.content;

    findings.push({
      claim: `Knowledge base entry from "${entry.source}" relates to "${request.query}"`,
      evidence: contentPreview,
      sourceIds: sources[i] ? [sources[i].id] : [],
      confidence: getDepthConfidence(request.depth) * getSourceTypeCredibilityMultiplier('KNOWLEDGE'),
    });
  }

  if (findings.length === 0) {
    findings.push({
      claim: `Knowledge base entries found for "${request.query}"`,
      evidence: 'Entries matched but no specific findings could be extracted',
      sourceIds: sources.slice(0, 1).map((s) => s.id),
      confidence: getDepthConfidence(request.depth) * 0.5,
    });
  }

  return findings;
}

function getSourceTypeCredibilityMultiplier(type: SourceType): number {
  switch (type) {
    case 'KNOWLEDGE': return 0.9;
    case 'DOCUMENT': return 0.8;
    case 'WEB': return 0.6;
  }
}

function generateContextAwareSources(
  request: ResearchRequest,
  keywords: string[]
): ResearchSource[] {
  const maxSources = Math.min(request.maxSources, 10);
  const now = new Date();

  return request.sourceTypes.slice(0, maxSources).map((type, i) => {
    const keyword = keywords[i % keywords.length] || request.query;
    return {
      id: `source-${Date.now()}-${i}`,
      type,
      title: `${type} Source ${i + 1}: ${keyword}`,
      url: type === 'WEB' ? `https://example.com/research/${encodeURIComponent(keyword)}` : undefined,
      credibilityScore: evaluateSourceCredibility({ type }) * getSourceTypeCredibilityMultiplier(type),
      excerpt: `Analysis of "${keyword}" from ${type.toLowerCase()} source in context of "${request.query}"`,
      accessedAt: now,
    };
  });
}

function generateContextAwareFindings(
  request: ResearchRequest,
  sources: ResearchSource[],
  keywords: string[]
): ResearchFinding[] {
  const findings: ResearchFinding[] = [];
  const baseConfidence = getDepthConfidence(request.depth);

  // Primary finding referencing the main topic keywords
  if (keywords.length > 0) {
    findings.push({
      claim: `Analysis of ${keywords.slice(0, 3).join(', ')} indicates relevance to "${request.query}"`,
      evidence: `Key terms identified: ${keywords.slice(0, 5).join(', ')}. Further AI-powered analysis recommended for deeper insights.`,
      sourceIds: sources.slice(0, 2).map((s) => s.id),
      confidence: baseConfidence * 0.6,
    });
  }

  // Secondary finding with topic-specific context
  if (keywords.length > 1) {
    findings.push({
      claim: `Relationship between ${keywords[0]} and ${keywords[1]} warrants further investigation`,
      evidence: `Multiple topic dimensions detected in query. Cross-referencing ${keywords[0]} with ${keywords[1]} may yield actionable insights.`,
      sourceIds: sources.slice(0, 1).map((s) => s.id),
      confidence: baseConfidence * 0.4,
    });
  }

  // Fallback if no keywords were extracted
  if (findings.length === 0) {
    findings.push({
      claim: `Preliminary assessment of "${request.query}" pending deeper analysis`,
      evidence: 'AI-powered research unavailable. Manual review of the topic is recommended.',
      sourceIds: sources.slice(0, 1).map((s) => s.id),
      confidence: baseConfidence * 0.3,
    });
  }

  return findings;
}

function getDepthConfidence(depth: ResearchRequest['depth']): number {
  switch (depth) {
    case 'QUICK': return 0.4;
    case 'STANDARD': return 0.65;
    case 'DEEP': return 0.85;
  }
}

function extractKeyTerms(content: string): string[] {
  const words = content.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function extractRisks(
  content: string
): { description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }[] {
  const riskKeywords = ['risk', 'danger', 'liability', 'penalty', 'loss', 'failure'];
  const lower = content.toLowerCase();
  const risks: { description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }[] = [];

  for (const keyword of riskKeywords) {
    if (lower.includes(keyword)) {
      risks.push({
        description: `Document mentions "${keyword}" — review for risk implications`,
        severity: keyword === 'liability' || keyword === 'penalty' ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  return risks;
}

function extractObligations(
  content: string
): { party: string; obligation: string; deadline?: string }[] {
  const obligationKeywords = ['must', 'shall', 'required to', 'obligated'];
  const lower = content.toLowerCase();
  const obligations: { party: string; obligation: string; deadline?: string }[] = [];

  for (const keyword of obligationKeywords) {
    if (lower.includes(keyword)) {
      obligations.push({
        party: 'Unspecified',
        obligation: `Document contains "${keyword}" clause — review for binding obligations`,
      });
    }
  }

  return obligations;
}
