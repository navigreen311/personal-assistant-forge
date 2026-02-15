import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import type { CitationRecord, ProvenanceChain } from '../types';

// In-memory store for citations
const citationStore = new Map<string, CitationRecord[]>(); // outputId -> citations[]

export async function addCitation(
  outputId: string,
  claim: string,
  sourceType: string,
  sourceId: string,
  sourceExcerpt: string
): Promise<CitationRecord> {
  const citation: CitationRecord = {
    claimId: uuidv4(),
    claim,
    sourceType: sourceType as CitationRecord['sourceType'],
    sourceId,
    sourceExcerpt,
    confidence: 1.0,
    verified: false,
  };

  const existing = citationStore.get(outputId) ?? [];
  existing.push(citation);
  citationStore.set(outputId, existing);

  return citation;
}

export async function getProvenance(
  outputId: string
): Promise<ProvenanceChain> {
  const citations = citationStore.get(outputId) ?? [];

  // Identify uncited claims (would require parsing the output in production)
  const uncitedClaims: string[] = [];

  const totalClaims = citations.length + uncitedClaims.length;
  const citationCoveragePercent =
    totalClaims > 0
      ? Math.round((citations.length / totalClaims) * 100)
      : 100;

  return {
    outputId,
    citations,
    uncitedClaims,
    citationCoveragePercent,
  };
}

export async function verifyCitation(
  citationId: string
): Promise<{ verified: boolean; reason: string }> {
  // Search all citations for the given ID
  for (const [outputId, citations] of citationStore) {
    const citation = citations.find((c) => c.claimId === citationId);
    if (!citation) continue;

    // Verify by checking the source
    try {
      let verified = false;
      let reason = '';

      switch (citation.sourceType) {
        case 'DOCUMENT': {
          const doc = await prisma.document.findUnique({
            where: { id: citation.sourceId },
          });
          if (!doc) {
            reason = 'Source document not found.';
          } else if (
            doc.content &&
            doc.content.includes(citation.sourceExcerpt.substring(0, 50))
          ) {
            verified = true;
            reason = 'Source excerpt found in document.';
          } else {
            reason =
              'Source excerpt not found in document content.';
          }
          break;
        }
        case 'MESSAGE': {
          const msg = await prisma.message.findUnique({
            where: { id: citation.sourceId },
          });
          if (!msg) {
            reason = 'Source message not found.';
          } else if (
            msg.body.includes(citation.sourceExcerpt.substring(0, 50))
          ) {
            verified = true;
            reason = 'Source excerpt found in message body.';
          } else {
            reason = 'Source excerpt not found in message.';
          }
          break;
        }
        case 'KNOWLEDGE': {
          const entry = await prisma.knowledgeEntry.findUnique({
            where: { id: citation.sourceId },
          });
          if (!entry) {
            reason = 'Source knowledge entry not found.';
          } else if (
            entry.content.includes(citation.sourceExcerpt.substring(0, 50))
          ) {
            verified = true;
            reason = 'Source excerpt found in knowledge base.';
          } else {
            reason = 'Source excerpt not found in knowledge entry.';
          }
          break;
        }
        case 'WEB':
          // Web sources cannot be verified offline
          reason = 'Web source verification not available offline.';
          break;
        default:
          reason = 'Unknown source type.';
      }

      citation.verified = verified;
      return { verified, reason };
    } catch {
      return { verified: false, reason: 'Error during verification.' };
    }
  }

  return { verified: false, reason: 'Citation not found.' };
}

// Exported for testing
export function _getCitationStore(): Map<string, CitationRecord[]> {
  return citationStore;
}
