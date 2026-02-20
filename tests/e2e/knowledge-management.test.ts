/**
 * E2E Test: Knowledge Management
 * Tests the full knowledge lifecycle: capture -> search -> graph -> SOP -> learning tracker
 *
 * Services under test:
 * - capture-service.ts (capture, batchCapture, generateAutoTags, generateTitle)
 * - search-service.ts (search, calculateRelevance, highlightExcerpt, suggestRelatedQueries)
 * - graph-service.ts (buildGraph, findConnections, detectClusters, getIsolatedNodes)
 * - sop-service.ts (createSOP, getSOP, listSOPs, updateSOP, matchSOPToContext, recordUsage)
 * - learning-tracker.ts (addLearningItem, updateProgress, getDueForReview, recordReview, calculateNextReview)
 */

// --- Infrastructure mocks (must be before imports) ---

const mockPrisma = {
  knowledgeEntry: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  document: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

import { capture, generateAutoTags, generateTitle } from '@/modules/knowledge/services/capture-service';
import { search, calculateRelevance, highlightExcerpt, suggestRelatedQueries } from '@/modules/knowledge/services/search-service';
import { buildGraph, findConnections, detectClusters, getIsolatedNodes } from '@/modules/knowledge/services/graph-service';
import { createSOP, getSOP, listSOPs, updateSOP, matchSOPToContext, recordUsage } from '@/modules/knowledge/services/sop-service';
import { addLearningItem, updateProgress, getDueForReview, recordReview, calculateNextReview } from '@/modules/knowledge/services/learning-tracker';
import { generateJSON } from '@/lib/ai';
import type { KnowledgeEntry } from '@/shared/types';
import type { KnowledgeGraph, SearchResult } from '@/modules/knowledge/types';

const mockGenerateJSON = generateJSON as jest.Mock;

// --- Test helpers ---

function makeKnowledgeEntry(overrides: Partial<KnowledgeEntry> & { title?: string; body?: string } = {}): KnowledgeEntry {
  const title = overrides.title || 'Test Title';
  const body = overrides.body || 'Test content for this entry';
  return {
    id: overrides.id || 'entry-1',
    content: JSON.stringify({ type: 'NOTE', title, body, autoTags: [] }),
    tags: overrides.tags || [],
    entityId: overrides.entityId || 'entity-1',
    source: overrides.source || 'manual',
    linkedEntities: overrides.linkedEntities || [],
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
  };
}

function makeSOPDoc(overrides: Record<string, unknown> = {}) {
  const sopData = {
    title: overrides.title || 'Test SOP',
    description: overrides.description || 'Test description',
    steps: overrides.steps || [{ order: 1, instruction: 'Step 1', isOptional: false }],
    triggerConditions: overrides.triggerConditions || ['new employee', 'onboarding'],
    status: overrides.sopStatus || 'ACTIVE',
    lastUsed: null,
    useCount: overrides.useCount || 0,
  };

  return {
    id: overrides.id || 'sop-1',
    title: sopData.title,
    entityId: overrides.entityId || 'entity-1',
    type: 'SOP',
    version: overrides.version || 1,
    content: JSON.stringify(sopData),
    status: 'APPROVED',
    citations: [],
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  };
}

function makeLearningEntry(overrides: Record<string, unknown> = {}) {
  const data = {
    title: overrides.title || 'Test Book',
    type: overrides.type || 'BOOK',
    status: overrides.status || 'QUEUED',
    progress: overrides.progress || 0,
    notes: overrides.notes || [],
    keyTakeaways: overrides.keyTakeaways || [],
    startedAt: null,
    completedAt: null,
    nextReviewDate: overrides.nextReviewDate || null,
    reviewCount: overrides.reviewCount || 0,
    easeFactor: overrides.easeFactor || 2.5,
    interval: overrides.interval || 0,
    url: null,
  };

  return {
    id: overrides.id || 'learn-1',
    content: JSON.stringify(data),
    tags: overrides.tags || ['learning'],
    entityId: overrides.entityId || 'entity-1',
    source: `learning://${(overrides.type as string || 'book').toLowerCase()}`,
    linkedEntities: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// --- Tests ---

describe('Knowledge Management E2E', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Knowledge Entry CRUD', () => {
    it('should capture a new knowledge entry with auto-generated tags and title', async () => {
      const createdEntry = makeKnowledgeEntry({
        id: 'entry-new',
        title: 'React hooks guide',
        body: 'React hooks are a powerful feature for managing state in functional components',
        tags: ['react', 'hooks', 'state', 'functional', 'components'],
      });
      mockPrisma.knowledgeEntry.create.mockResolvedValue(createdEntry);

      const result = await capture({
        entityId: 'entity-1',
        type: 'NOTE',
        content: 'React hooks are a powerful feature for managing state in functional components',
        source: 'manual',
        tags: ['react'],
      });

      expect(result.id).toBe('entry-new');
      expect(mockPrisma.knowledgeEntry.create).toHaveBeenCalledTimes(1);
    });

    it('should generate auto-tags from content keywords', () => {
      const tags = generateAutoTags('TypeScript React development framework JavaScript patterns');
      expect(tags).toContain('typescript');
      expect(tags).toContain('react');
      expect(tags).toContain('development');
      expect(tags).toContain('framework');
      expect(tags).toContain('javascript');
      expect(tags).toContain('patterns');
    });

    it('should filter stop words from auto-tags', () => {
      const tags = generateAutoTags('the quick brown fox jumped over the lazy dog');
      expect(tags).not.toContain('the');
      expect(tags).not.toContain('over');
      expect(tags).toContain('quick');
      expect(tags).toContain('brown');
    });

    it('should generate a title from content', () => {
      const title = generateTitle('This is a short note about React hooks. More details follow.', 'NOTE');
      expect(title).toBe('This is a short note about React hooks');
    });

    it('should truncate long titles with ellipsis', () => {
      const longContent = 'A'.repeat(100);
      const title = generateTitle(longContent, 'NOTE');
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).toContain('...');
    });

    it('should return "Untitled TYPE" for empty content', () => {
      expect(generateTitle('', 'NOTE')).toBe('Untitled NOTE');
      expect(generateTitle('   ', 'BOOKMARK')).toBe('Untitled BOOKMARK');
    });
  });

  describe('Knowledge Graph Building', () => {
    it('should build a graph with nodes for entries and tags', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
        makeKnowledgeEntry({ id: 'e1', tags: ['react', 'typescript'] }),
        makeKnowledgeEntry({ id: 'e2', tags: ['react'] }),
        makeKnowledgeEntry({ id: 'e3', tags: ['python'] }),
      ]);

      const graph = await buildGraph('entity-1');
      expect(graph.nodes.filter((n) => n.type === 'KNOWLEDGE').length).toBe(3);
      expect(graph.nodes.filter((n) => n.type === 'TAG').length).toBe(3);
    });

    it('should create edges for linked entities', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
        makeKnowledgeEntry({ id: 'e1', linkedEntities: ['e2'], tags: [] }),
        makeKnowledgeEntry({ id: 'e2', linkedEntities: ['e1'], tags: [] }),
      ]);

      const graph = await buildGraph('entity-1');
      const relatedEdges = graph.edges.filter((e) => e.relationship === 'related_to');
      expect(relatedEdges.length).toBeGreaterThan(0);
    });

    it('should create tag edges', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
        makeKnowledgeEntry({ id: 'e1', tags: ['react', 'typescript'] }),
      ]);

      const graph = await buildGraph('entity-1');
      const tagEdges = graph.edges.filter((e) => e.relationship === 'tagged_with');
      expect(tagEdges.length).toBe(2);
    });

    it('should compute correct graph stats', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
        makeKnowledgeEntry({ id: 'e1', tags: ['react'] }),
        makeKnowledgeEntry({ id: 'e2', tags: [] }),
      ]);

      const graph = await buildGraph('entity-1');
      expect(graph.stats.totalNodes).toBe(3);
      expect(graph.stats.totalEdges).toBe(1);
      expect(graph.stats.isolatedNodes).toBe(1);
    });

    it('should handle empty entries gracefully', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([]);
      const graph = await buildGraph('entity-1');
      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
    });

    it('should find direct connections via BFS at depth 1', async () => {
      const entries = [
        makeKnowledgeEntry({ id: 'e1', tags: ['react'], linkedEntities: ['e2'] }),
        makeKnowledgeEntry({ id: 'e2', tags: ['react'], linkedEntities: ['e1'] }),
        makeKnowledgeEntry({ id: 'e3', tags: ['python'], linkedEntities: [] }),
      ];
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(entries[0]);
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue(entries);

      const { nodes } = await findConnections('e1', 1);
      const nodeIds = nodes.map((n) => n.id);
      expect(nodeIds).toContain('e1');
      expect(nodes.length).toBeGreaterThan(1);
    });

    it('should return empty for non-existent entry connections', async () => {
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(null);
      const { nodes, edges } = await findConnections('nonexistent', 1);
      expect(nodes).toEqual([]);
      expect(edges).toEqual([]);
    });

    it('should detect clusters of nodes sharing 2+ tags', () => {
      const graph: KnowledgeGraph = {
        nodes: [
          { id: 'e1', label: 'Entry 1', type: 'KNOWLEDGE', metadata: {}, connectionCount: 2 },
          { id: 'e2', label: 'Entry 2', type: 'KNOWLEDGE', metadata: {}, connectionCount: 2 },
          { id: 'tag:react', label: 'react', type: 'TAG', metadata: {}, connectionCount: 2 },
          { id: 'tag:typescript', label: 'typescript', type: 'TAG', metadata: {}, connectionCount: 2 },
        ],
        edges: [
          { sourceId: 'e1', targetId: 'tag:react', relationship: 'tagged_with', strength: 0.5 },
          { sourceId: 'e1', targetId: 'tag:typescript', relationship: 'tagged_with', strength: 0.5 },
          { sourceId: 'e2', targetId: 'tag:react', relationship: 'tagged_with', strength: 0.5 },
          { sourceId: 'e2', targetId: 'tag:typescript', relationship: 'tagged_with', strength: 0.5 },
        ],
        clusters: [],
        stats: { totalNodes: 4, totalEdges: 4, avgConnections: 2, isolatedNodes: 0 },
      };

      const clusters = detectClusters(graph);
      const cluster = clusters.find((c) => c.nodeIds.includes('e1') && c.nodeIds.includes('e2'));
      expect(cluster).toBeDefined();
      expect(cluster!.nodeIds.length).toBe(2);
    });

    it('should identify isolated nodes with no connections', async () => {
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
        makeKnowledgeEntry({ id: 'e1', tags: ['react'] }),
        makeKnowledgeEntry({ id: 'e2', tags: [] }),
      ]);

      const isolated = await getIsolatedNodes('entity-1');
      const isolatedIds = isolated.map((n) => n.id);
      expect(isolatedIds).toContain('e2');
      expect(isolatedIds).not.toContain('e1');
    });
  });

  describe('SOP Management', () => {
    it('should create a new SOP', async () => {
      mockPrisma.document.create.mockResolvedValue(makeSOPDoc({ id: 'sop-new', title: 'Employee Onboarding' }));

      const sop = await createSOP({
        entityId: 'entity-1',
        title: 'Employee Onboarding',
        description: 'Steps for onboarding new employees',
        steps: [
          { order: 1, instruction: 'Send welcome email', isOptional: false },
          { order: 2, instruction: 'Schedule orientation', isOptional: false },
        ],
        triggerConditions: ['new employee', 'onboarding'],
        tags: ['hr', 'onboarding'],
        status: 'ACTIVE',
      });

      expect(sop.title).toBe('Employee Onboarding');
      expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
    });

    it('should retrieve SOP by ID', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeSOPDoc({ id: 'sop-1' }));
      const sop = await getSOP('sop-1');
      expect(sop).not.toBeNull();
      expect(sop!.id).toBe('sop-1');
    });

    it('should return null for non-existent SOP', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      const sop = await getSOP('nonexistent');
      expect(sop).toBeNull();
    });

    it('should update SOP and increment version', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeSOPDoc({ id: 'sop-1', version: 1 }));
      mockPrisma.document.update.mockResolvedValue(makeSOPDoc({ id: 'sop-1', version: 2, title: 'Updated SOP' }));

      await updateSOP('sop-1', { title: 'Updated SOP' });

      expect(mockPrisma.document.update).toHaveBeenCalledTimes(1);
      const updateCall = (mockPrisma.document.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.version).toBe(2);
    });

    it('should throw when updating non-existent SOP', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(updateSOP('nonexistent', { title: 'Test' })).rejects.toThrow();
    });

    it('should match SOPs to context via trigger conditions', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makeSOPDoc({ id: 'sop-1', triggerConditions: ['new employee', 'onboarding'] }),
        makeSOPDoc({ id: 'sop-2', triggerConditions: ['monthly report', 'audit'] }),
      ]);

      const matches = await matchSOPToContext('new employee just started onboarding', 'entity-1');
      expect(matches.some((s) => s.id === 'sop-1')).toBe(true);
    });

    it('should record SOP usage and increment useCount', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeSOPDoc({ id: 'sop-1', useCount: 5 }));
      mockPrisma.document.update.mockResolvedValue({});

      await recordUsage('sop-1');

      const updateCall = (mockPrisma.document.update as jest.Mock).mock.calls[0][0];
      const updatedContent = JSON.parse(updateCall.data.content);
      expect(updatedContent.useCount).toBe(6);
    });

    it('should throw when recording usage for non-existent SOP', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(recordUsage('nonexistent')).rejects.toThrow();
    });
  });

  describe('Learning Tracker with Spaced Repetition', () => {
    it('should add a new learning item with reviewCount 0', async () => {
      mockPrisma.knowledgeEntry.create.mockResolvedValue(makeLearningEntry());
      const item = await addLearningItem({ entityId: 'entity-1', title: 'Test Book', type: 'BOOK', status: 'QUEUED', progress: 0, notes: [], keyTakeaways: [], tags: ['learning'] });
      expect(item.reviewCount).toBe(0);
    });

    it('should auto-complete when progress reaches 100', async () => {
      const entry = makeLearningEntry({ id: 'learn-1', progress: 50, status: 'IN_PROGRESS' });
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(entry);
      mockPrisma.knowledgeEntry.update.mockImplementation(async ({ data }: { data: { content: string } }) => ({ ...entry, content: data.content }));
      const item = await updateProgress('learn-1', 100);
      expect(item.status).toBe('COMPLETED');
      expect(item.progress).toBe(100);
    });

    it('should transition QUEUED to IN_PROGRESS when progress > 0', async () => {
      const entry = makeLearningEntry({ id: 'learn-1', progress: 0, status: 'QUEUED' });
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(entry);
      mockPrisma.knowledgeEntry.update.mockImplementation(async ({ data }: { data: { content: string } }) => ({ ...entry, content: data.content }));
      const item = await updateProgress('learn-1', 25);
      expect(item.status).toBe('IN_PROGRESS');
    });

    it('should return items due for review', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
        makeLearningEntry({ id: 'learn-1', nextReviewDate: pastDate }),
        makeLearningEntry({ id: 'learn-2', nextReviewDate: futureDate }),
      ]);
      const due = await getDueForReview('entity-1');
      expect(due.map((i) => i.id)).toContain('learn-1');
      expect(due.map((i) => i.id)).not.toContain('learn-2');
    });

    it('should record a review and update schedule via SM-2', async () => {
      const entry = makeLearningEntry({ id: 'learn-1', reviewCount: 0, easeFactor: 2.5 });
      mockPrisma.knowledgeEntry.findUnique.mockResolvedValue(entry);
      mockPrisma.knowledgeEntry.update.mockResolvedValue(entry);
      const schedule = await recordReview('learn-1', 5);
      expect(schedule.interval).toBe(1);
      expect(schedule.easeFactor).toBeCloseTo(2.6, 1);
    });

    describe('SM-2 spaced repetition algorithm', () => {
      it('should set interval=1 for first review with quality=5', () => {
        const s = calculateNextReview(0, 2.5, 5);
        expect(s.interval).toBe(1);
        expect(s.easeFactor).toBeCloseTo(2.6, 1);
      });

      it('should set interval=6 for second review with quality=5', () => {
        const s = calculateNextReview(1, 2.6, 5);
        expect(s.interval).toBe(6);
      });

      it('should reset interval to 1 when quality < 3', () => {
        expect(calculateNextReview(5, 2.5, 2).interval).toBe(1);
      });

      it('should never drop ease factor below 1.3', () => {
        expect(calculateNextReview(1, 1.3, 0).easeFactor).toBeGreaterThanOrEqual(1.3);
      });

      it('should set a future nextReviewDate', () => {
        const before = new Date();
        expect(calculateNextReview(0, 2.5, 5).nextReviewDate.getTime()).toBeGreaterThan(before.getTime());
      });
    });
  });

  describe('Knowledge Search', () => {
    it('should search with AI query expansion', async () => {
      mockGenerateJSON.mockResolvedValue({ expandedQuery: 'react hooks useState useEffect' });
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
        makeKnowledgeEntry({ id: '1', title: 'React hooks deep dive', body: 'React hooks are powerful', tags: ['react', 'hooks'], updatedAt: new Date() }),
      ]);
      const result = await search({ entityId: 'entity-1', query: 'react' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should fall back to keyword search on AI failure', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([
        makeKnowledgeEntry({ id: '1', title: 'React hooks', body: 'React hooks are powerful', tags: ['react'], updatedAt: new Date() }),
      ]);
      const result = await search({ entityId: 'entity-1', query: 'react' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should paginate search results', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      const entries = Array.from({ length: 10 }, (_, i) => makeKnowledgeEntry({ id: `entry-${i}`, title: `React entry ${i}`, body: `React content ${i}` }));
      mockPrisma.knowledgeEntry.findMany.mockResolvedValue(entries);
      const result = await search({ entityId: 'entity-1', query: 'react', page: 1, pageSize: 3 });
      expect(result.results.length).toBe(3);
      expect(result.total).toBe(10);
    });

    it('should weight title matches higher than content matches', () => {
      const titleScore = calculateRelevance('react', makeKnowledgeEntry({ title: 'react hooks guide', body: 'other content' }));
      const contentScore = calculateRelevance('react', makeKnowledgeEntry({ title: 'general guide', body: 'about react development' }));
      expect(titleScore).toBeGreaterThan(contentScore);
    });

    it('should extract highlighted excerpt around search term', () => {
      const excerpt = highlightExcerpt('Lorem ipsum. React is a great framework.', 'React', 30);
      expect(excerpt).toContain('React');
    });

    it('should suggest related queries based on result tags', () => {
      const results: SearchResult[] = [{
        entry: { id: '1', entityId: 'e1', type: 'NOTE', title: 'React Guide', content: 'c', source: 'manual', tags: ['react', 'typescript', 'hooks'], autoTags: [], linkedEntries: [], createdAt: new Date(), updatedAt: new Date() },
        relevanceScore: 0.8, matchedFields: ['title'], highlightedExcerpt: '...',
      }];
      const suggestions = suggestRelatedQueries('react', results);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Full Knowledge Lifecycle', () => {
    it('should capture entry, build graph, then search for it', async () => {
      const capturedEntry = makeKnowledgeEntry({ id: 'lifecycle-1', title: 'Docker deployment', body: 'Docker containers should be stateless', tags: ['docker', 'deployment'] });
      mockPrisma.knowledgeEntry.create.mockResolvedValue(capturedEntry);
      const captured = await capture({ entityId: 'entity-1', type: 'NOTE', content: 'Docker containers should be stateless', source: 'manual', tags: ['docker'] });
      expect(captured.id).toBe('lifecycle-1');

      mockPrisma.knowledgeEntry.findMany.mockResolvedValue([capturedEntry]);
      const graph = await buildGraph('entity-1');
      expect(graph.nodes.some((n) => n.id === 'lifecycle-1')).toBe(true);

      mockGenerateJSON.mockRejectedValue(new Error('no AI'));
      const searchResult = await search({ entityId: 'entity-1', query: 'docker' });
      expect(searchResult.results.length).toBeGreaterThan(0);
    });
  });
});
