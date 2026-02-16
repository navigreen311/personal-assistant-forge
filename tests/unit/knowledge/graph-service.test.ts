import { buildGraph, findConnections, detectClusters, getIsolatedNodes } from '@/modules/knowledge/services/graph-service';
import type { KnowledgeEntry } from '@/shared/types';
import type { KnowledgeGraph } from '@/modules/knowledge/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockFindMany = prisma.knowledgeEntry.findMany as jest.Mock;
const mockFindUnique = prisma.knowledgeEntry.findUnique as jest.Mock;

function makeEntry(overrides: Partial<KnowledgeEntry> & { title?: string }): KnowledgeEntry {
  const title = overrides.title || 'Test Title';
  return {
    id: overrides.id || 'entry-1',
    content: JSON.stringify({ type: 'NOTE', title, body: 'Content', autoTags: [] }),
    tags: overrides.tags || [],
    entityId: overrides.entityId || 'entity-1',
    source: overrides.source || 'manual',
    linkedEntities: overrides.linkedEntities || [],
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
  };
}

describe('graph-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildGraph', () => {
    it('should create nodes for each entry and tag', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', tags: ['react', 'typescript'] }),
        makeEntry({ id: 'e2', tags: ['react'] }),
      ]);

      const graph = await buildGraph('entity-1');

      // 2 knowledge nodes + 2 unique tag nodes
      expect(graph.nodes.length).toBe(4);
      expect(graph.nodes.filter((n) => n.type === 'KNOWLEDGE').length).toBe(2);
      expect(graph.nodes.filter((n) => n.type === 'TAG').length).toBe(2);
    });

    it('should create edges for linked entities', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', linkedEntities: ['e2'], tags: [] }),
        makeEntry({ id: 'e2', linkedEntities: ['e1'], tags: [] }),
      ]);

      const graph = await buildGraph('entity-1');
      const relatedEdges = graph.edges.filter((e) => e.relationship === 'related_to');
      expect(relatedEdges.length).toBeGreaterThan(0);
    });

    it('should create edges for tags', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', tags: ['react'] }),
      ]);

      const graph = await buildGraph('entity-1');
      const tagEdges = graph.edges.filter((e) => e.relationship === 'tagged_with');
      expect(tagEdges.length).toBe(1);
    });

    it('should compute correct stats', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', tags: ['react'] }),
        makeEntry({ id: 'e2', tags: [] }),
      ]);

      const graph = await buildGraph('entity-1');
      expect(graph.stats.totalNodes).toBe(3); // 2 entries + 1 tag
      expect(graph.stats.totalEdges).toBe(1); // 1 tagged_with
      expect(graph.stats.isolatedNodes).toBe(1); // e2 has no connections
    });

    it('should handle empty entries', async () => {
      mockFindMany.mockResolvedValue([]);
      const graph = await buildGraph('entity-1');
      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
    });
  });

  describe('findConnections (BFS)', () => {
    it('should find direct connections at depth 1', async () => {
      const entries = [
        makeEntry({ id: 'e1', tags: ['react'], linkedEntities: ['e2'] }),
        makeEntry({ id: 'e2', tags: ['react'], linkedEntities: ['e1'] }),
        makeEntry({ id: 'e3', tags: ['python'], linkedEntities: [] }),
      ];

      mockFindUnique.mockResolvedValue(entries[0]);
      mockFindMany.mockResolvedValue(entries);

      const { nodes, edges } = await findConnections('e1', 1);
      const nodeIds = nodes.map((n) => n.id);
      expect(nodeIds).toContain('e1');
      // Should find connected nodes through tags and links
      expect(nodes.length).toBeGreaterThan(1);
    });

    it('should find deeper connections at depth 2', async () => {
      const entries = [
        makeEntry({ id: 'e1', tags: ['react'], linkedEntities: ['e2'] }),
        makeEntry({ id: 'e2', tags: ['react', 'typescript'], linkedEntities: ['e1', 'e3'] }),
        makeEntry({ id: 'e3', tags: ['typescript'], linkedEntities: ['e2'] }),
      ];

      mockFindUnique.mockResolvedValue(entries[0]);
      mockFindMany.mockResolvedValue(entries);

      const { nodes: depth1 } = await findConnections('e1', 1);
      const { nodes: depth2 } = await findConnections('e1', 2);

      expect(depth2.length).toBeGreaterThanOrEqual(depth1.length);
    });

    it('should return empty for non-existent entry', async () => {
      mockFindUnique.mockResolvedValue(null);
      const { nodes, edges } = await findConnections('nonexistent', 1);
      expect(nodes).toEqual([]);
      expect(edges).toEqual([]);
    });
  });

  describe('detectClusters', () => {
    it('should group nodes sharing 2+ tags', () => {
      const graph: KnowledgeGraph = {
        nodes: [
          { id: 'e1', label: 'Entry 1', type: 'KNOWLEDGE', metadata: {}, connectionCount: 2 },
          { id: 'e2', label: 'Entry 2', type: 'KNOWLEDGE', metadata: {}, connectionCount: 2 },
          { id: 'e3', label: 'Entry 3', type: 'KNOWLEDGE', metadata: {}, connectionCount: 1 },
          { id: 'tag:react', label: 'react', type: 'TAG', metadata: {}, connectionCount: 2 },
          { id: 'tag:typescript', label: 'typescript', type: 'TAG', metadata: {}, connectionCount: 2 },
          { id: 'tag:python', label: 'python', type: 'TAG', metadata: {}, connectionCount: 1 },
        ],
        edges: [
          { sourceId: 'e1', targetId: 'tag:react', relationship: 'tagged_with', strength: 0.5 },
          { sourceId: 'e1', targetId: 'tag:typescript', relationship: 'tagged_with', strength: 0.5 },
          { sourceId: 'e2', targetId: 'tag:react', relationship: 'tagged_with', strength: 0.5 },
          { sourceId: 'e2', targetId: 'tag:typescript', relationship: 'tagged_with', strength: 0.5 },
          { sourceId: 'e3', targetId: 'tag:python', relationship: 'tagged_with', strength: 0.5 },
        ],
        clusters: [],
        stats: { totalNodes: 6, totalEdges: 5, avgConnections: 1.67, isolatedNodes: 0 },
      };

      const clusters = detectClusters(graph);

      // e1 and e2 share 2 tags (react, typescript), should be clustered
      expect(clusters.length).toBeGreaterThanOrEqual(1);
      const cluster = clusters.find((c) => c.nodeIds.includes('e1') && c.nodeIds.includes('e2'));
      expect(cluster).toBeDefined();
      expect(cluster!.nodeIds.length).toBe(2);
    });

    it('should not cluster nodes sharing fewer than 2 tags', () => {
      const graph: KnowledgeGraph = {
        nodes: [
          { id: 'e1', label: 'Entry 1', type: 'KNOWLEDGE', metadata: {}, connectionCount: 1 },
          { id: 'e2', label: 'Entry 2', type: 'KNOWLEDGE', metadata: {}, connectionCount: 1 },
          { id: 'tag:react', label: 'react', type: 'TAG', metadata: {}, connectionCount: 2 },
        ],
        edges: [
          { sourceId: 'e1', targetId: 'tag:react', relationship: 'tagged_with', strength: 0.5 },
          { sourceId: 'e2', targetId: 'tag:react', relationship: 'tagged_with', strength: 0.5 },
        ],
        clusters: [],
        stats: { totalNodes: 3, totalEdges: 2, avgConnections: 1.33, isolatedNodes: 0 },
      };

      const clusters = detectClusters(graph);
      const cluster = clusters.find((c) => c.nodeIds.includes('e1') && c.nodeIds.includes('e2'));
      expect(cluster).toBeUndefined();
    });
  });

  describe('getIsolatedNodes', () => {
    it('should find nodes with no connections', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', tags: ['react'] }),
        makeEntry({ id: 'e2', tags: [] }),
      ]);

      const isolated = await getIsolatedNodes('entity-1');
      const isolatedIds = isolated.map((n) => n.id);
      expect(isolatedIds).toContain('e2');
      expect(isolatedIds).not.toContain('e1');
    });
  });
});
