import {
  addCitation,
  getProvenance,
  verifyCitation,
  _getCitationStore,
} from '@/modules/ai-quality/services/citation-service';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    knowledgeEntry: { findUnique: jest.fn() },
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI verification: citation is valid.'),
}));

const { prisma } = require('@/lib/db');
const { generateText } = require('@/lib/ai');

describe('CitationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _getCitationStore().clear();
  });

  describe('addCitation', () => {
    it('should create a citation record with the correct fields', async () => {
      const citation = await addCitation(
        'output-1',
        'The sky is blue',
        'DOCUMENT',
        'doc-1',
        'The sky appears blue due to Rayleigh scattering'
      );

      expect(citation.claimId).toBeDefined();
      expect(citation.claim).toBe('The sky is blue');
      expect(citation.sourceType).toBe('DOCUMENT');
      expect(citation.sourceId).toBe('doc-1');
      expect(citation.sourceExcerpt).toBe('The sky appears blue due to Rayleigh scattering');
      expect(citation.confidence).toBe(1.0);
      expect(citation.verified).toBe(false);
    });

    it('should store multiple citations for the same output', async () => {
      await addCitation('output-1', 'Claim A', 'DOCUMENT', 'doc-1', 'Excerpt A');
      await addCitation('output-1', 'Claim B', 'MESSAGE', 'msg-1', 'Excerpt B');

      const store = _getCitationStore();
      expect(store.get('output-1')).toHaveLength(2);
    });
  });

  describe('getProvenance', () => {
    it('should return provenance chain with all citations for an output', async () => {
      await addCitation('output-1', 'Claim A', 'DOCUMENT', 'doc-1', 'Excerpt A');
      await addCitation('output-1', 'Claim B', 'KNOWLEDGE', 'ke-1', 'Excerpt B');

      const provenance = await getProvenance('output-1');

      expect(provenance.outputId).toBe('output-1');
      expect(provenance.citations).toHaveLength(2);
      expect(provenance.citationCoveragePercent).toBe(100);
    });

    it('should return 100% coverage when there are no claims at all', async () => {
      const provenance = await getProvenance('output-empty');

      expect(provenance.citations).toHaveLength(0);
      expect(provenance.uncitedClaims).toHaveLength(0);
      expect(provenance.citationCoveragePercent).toBe(100);
    });
  });

  describe('verifyCitation', () => {
    it('should verify a DOCUMENT citation when excerpt is found in content', async () => {
      const citation = await addCitation(
        'output-1',
        'Data is important',
        'DOCUMENT',
        'doc-1',
        'Data is important for decision making in enterprises'
      );

      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        content: 'Data is important for decision making in enterprises and organizations.',
      });

      const result = await verifyCitation(citation.claimId);
      expect(result.verified).toBe(true);
    });

    it('should fail verification when source document is not found', async () => {
      const citation = await addCitation(
        'output-1',
        'Claim X',
        'DOCUMENT',
        'doc-missing',
        'Excerpt X'
      );

      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await verifyCitation(citation.claimId);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('Source document not found.');
    });

    it('should verify a MESSAGE citation when excerpt is found in body', async () => {
      const citation = await addCitation(
        'output-2',
        'Meeting is at 3pm',
        'MESSAGE',
        'msg-1',
        'Meeting is at 3pm tomorrow in the conference room'
      );

      (prisma.message.findUnique as jest.Mock).mockResolvedValue({
        id: 'msg-1',
        body: 'Meeting is at 3pm tomorrow in the conference room. Please bring your notes.',
      });

      const result = await verifyCitation(citation.claimId);
      expect(result.verified).toBe(true);
    });

    it('should verify a KNOWLEDGE citation when excerpt is found', async () => {
      const citation = await addCitation(
        'output-3',
        'React uses virtual DOM',
        'KNOWLEDGE',
        'ke-1',
        'React uses virtual DOM for efficient rendering'
      );

      (prisma.knowledgeEntry.findUnique as jest.Mock).mockResolvedValue({
        id: 'ke-1',
        content: 'React uses virtual DOM for efficient rendering and reconciliation.',
      });

      const result = await verifyCitation(citation.claimId);
      expect(result.verified).toBe(true);
    });

    it('should return not found for WEB source type', async () => {
      const citation = await addCitation(
        'output-4',
        'Web claim',
        'WEB',
        'url-1',
        'Web excerpt'
      );

      const result = await verifyCitation(citation.claimId);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('Web source verification not available offline.');
    });

    it('should return not found for a non-existent citation ID', async () => {
      const result = await verifyCitation('nonexistent-id');
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('Citation not found.');
    });

    it('should use AI for cross-check when source content is available', async () => {
      const citation = await addCitation(
        'output-5',
        'Important claim',
        'DOCUMENT',
        'doc-2',
        'Important claim is supported by this document section'
      );

      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'doc-2',
        content: 'Important claim is supported by this document section with extra context.',
      });

      generateText.mockResolvedValue('The citation is valid and well-supported.');

      const result = await verifyCitation(citation.claimId);
      expect(result.verified).toBe(true);
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('should fall back to text matching when AI fails', async () => {
      const citation = await addCitation(
        'output-6',
        'Fallback test',
        'DOCUMENT',
        'doc-3',
        'Fallback test excerpt for graceful degradation'
      );

      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'doc-3',
        content: 'Fallback test excerpt for graceful degradation in production environments.',
      });

      generateText.mockRejectedValue(new Error('AI unavailable'));

      const result = await verifyCitation(citation.claimId);
      expect(result.verified).toBe(true);
      expect(result.reason).toBe('Source excerpt found in document.');
    });
  });
});
