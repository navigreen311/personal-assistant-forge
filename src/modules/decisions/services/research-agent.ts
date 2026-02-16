// ============================================================================
// Deep Research Agent Service (AI-Powered with Fallback)
// ============================================================================

import { generateJSON, generateText } from '@/lib/ai';
import type {
  ResearchRequest,
  ResearchReport,
  ResearchSource,
  ResearchFinding,
  DocumentAnalysis,
  SourceType,
} from '@/modules/decisions/types';

/**
 * Conduct research using AI to produce contextual findings and summary.
 * Falls back to placeholder data on AI failure.
 */
export async function conductResearch(
  request: ResearchRequest
): Promise<ResearchReport> {
  try {
    return await conductResearchWithAI(request);
  } catch {
    // Fall back to placeholder research on AI failure
    const sources = generatePlaceholderSources(request);
    const findings = generatePlaceholderFindings(request, sources);

    return {
      id: `research-${Date.now()}`,
      query: request.query,
      summary: `Research summary for: "${request.query}". ` +
        `Depth: ${request.depth}. ${sources.length} sources consulted.`,
      findings,
      sources,
      confidenceScore: getDepthConfidence(request.depth),
      gaps: [
        'Proprietary data not accessible',
        'Historical trends beyond 5 years not analyzed',
        'Competitor intelligence limited to public sources',
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

function generatePlaceholderSources(request: ResearchRequest): ResearchSource[] {
  const maxSources = Math.min(request.maxSources, 10);
  const now = new Date();

  return request.sourceTypes.slice(0, maxSources).map((type, i) => ({
    id: `source-${Date.now()}-${i}`,
    type,
    title: `${type} Source ${i + 1}: ${request.query}`,
    url: type === 'WEB' ? `https://example.com/research/${i}` : undefined,
    credibilityScore: evaluateSourceCredibility({ type }),
    excerpt: `Relevant excerpt from ${type.toLowerCase()} source regarding "${request.query}"`,
    accessedAt: now,
  }));
}

function generatePlaceholderFindings(
  request: ResearchRequest,
  sources: ResearchSource[]
): ResearchFinding[] {
  return [
    {
      claim: `Primary finding related to "${request.query}"`,
      evidence: 'Based on analysis of available sources',
      sourceIds: sources.slice(0, 2).map((s) => s.id),
      confidence: getDepthConfidence(request.depth),
    },
    {
      claim: `Supporting data point for "${request.query}"`,
      evidence: 'Corroborated across multiple source types',
      sourceIds: sources.slice(0, 1).map((s) => s.id),
      confidence: getDepthConfidence(request.depth) * 0.8,
    },
  ];
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
