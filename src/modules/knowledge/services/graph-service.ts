import { prisma } from '@/lib/db';
import type { KnowledgeEntry } from '@/shared/types';
import type { GraphNode, GraphEdge, KnowledgeGraph, GraphCluster } from '@/modules/knowledge/types';
import { parseStoredData } from './capture-service';

export async function buildGraph(entityId: string): Promise<KnowledgeGraph> {
  const entries = await prisma.knowledgeEntry.findMany({ where: { entityId } });
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const tagNodes = new Map<string, GraphNode>();

  // Create knowledge nodes
  for (const entry of entries) {
    const ke = entry as unknown as KnowledgeEntry;
    const stored = parseStoredData(ke.content);
    nodes.push({
      id: ke.id,
      label: stored.title,
      type: 'KNOWLEDGE',
      metadata: { source: ke.source, type: stored.type },
      connectionCount: 0,
    });

    // Create tag nodes and edges
    for (const tag of ke.tags) {
      const tagId = `tag:${tag}`;
      if (!tagNodes.has(tagId)) {
        tagNodes.set(tagId, {
          id: tagId,
          label: tag,
          type: 'TAG',
          metadata: {},
          connectionCount: 0,
        });
      }
      edges.push({
        sourceId: ke.id,
        targetId: tagId,
        relationship: 'tagged_with',
        strength: 0.5,
      });
    }

    // Create edges for linked entities
    for (const linkedId of ke.linkedEntities) {
      const alreadyExists = edges.some(
        (e) =>
          (e.sourceId === ke.id && e.targetId === linkedId) ||
          (e.sourceId === linkedId && e.targetId === ke.id && e.relationship === 'related_to')
      );
      if (!alreadyExists) {
        edges.push({
          sourceId: ke.id,
          targetId: linkedId,
          relationship: 'related_to',
          strength: 0.7,
        });
      }
    }
  }

  // Add tag nodes
  for (const tagNode of tagNodes.values()) {
    nodes.push(tagNode);
  }

  // Calculate connection counts
  const connCounts = new Map<string, number>();
  for (const edge of edges) {
    connCounts.set(edge.sourceId, (connCounts.get(edge.sourceId) || 0) + 1);
    connCounts.set(edge.targetId, (connCounts.get(edge.targetId) || 0) + 1);
  }
  for (const node of nodes) {
    node.connectionCount = connCounts.get(node.id) || 0;
  }

  const graph: KnowledgeGraph = {
    nodes,
    edges,
    clusters: [],
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      avgConnections: nodes.length > 0 ? edges.length * 2 / nodes.length : 0,
      isolatedNodes: nodes.filter((n) => n.connectionCount === 0).length,
    },
  };

  graph.clusters = detectClusters(graph);

  return graph;
}

export async function findConnections(
  entryId: string,
  depth: number
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const entry = await prisma.knowledgeEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { nodes: [], edges: [] };

  const ke = entry as unknown as KnowledgeEntry;
  const graph = await buildGraph(ke.entityId);

  // BFS traversal
  const visited = new Set<string>();
  const resultNodes: GraphNode[] = [];
  const resultEdges: GraphEdge[] = [];
  const queue: { id: string; currentDepth: number }[] = [{ id: entryId, currentDepth: 0 }];

  visited.add(entryId);

  while (queue.length > 0) {
    const { id, currentDepth } = queue.shift()!;

    const node = graph.nodes.find((n) => n.id === id);
    if (node) resultNodes.push(node);

    if (currentDepth >= depth) continue;

    const connectedEdges = graph.edges.filter((e) => e.sourceId === id || e.targetId === id);
    for (const edge of connectedEdges) {
      resultEdges.push(edge);
      const neighborId = edge.sourceId === id ? edge.targetId : edge.sourceId;
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ id: neighborId, currentDepth: currentDepth + 1 });
      }
    }
  }

  return { nodes: resultNodes, edges: resultEdges };
}

export function detectClusters(graph: KnowledgeGraph): GraphCluster[] {
  const knowledgeNodes = graph.nodes.filter((n) => n.type === 'KNOWLEDGE');

  // Build tag sets for each knowledge node
  const nodeTags = new Map<string, Set<string>>();
  for (const node of knowledgeNodes) {
    const tags = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.relationship === 'tagged_with' && edge.sourceId === node.id) {
        const tagNode = graph.nodes.find((n) => n.id === edge.targetId && n.type === 'TAG');
        if (tagNode) tags.add(tagNode.label);
      }
    }
    nodeTags.set(node.id, tags);
  }

  // Group nodes sharing 2+ tags using union-find approach
  const clusterMap = new Map<string, Set<string>>();
  const nodeToCluster = new Map<string, string>();

  for (let i = 0; i < knowledgeNodes.length; i++) {
    for (let j = i + 1; j < knowledgeNodes.length; j++) {
      const tagsA = nodeTags.get(knowledgeNodes[i].id) || new Set();
      const tagsB = nodeTags.get(knowledgeNodes[j].id) || new Set();
      const shared = [...tagsA].filter((t) => tagsB.has(t));

      if (shared.length >= 2) {
        const clusterIdA = nodeToCluster.get(knowledgeNodes[i].id);
        const clusterIdB = nodeToCluster.get(knowledgeNodes[j].id);

        if (clusterIdA && clusterIdB && clusterIdA !== clusterIdB) {
          // Merge clusters
          const clusterB = clusterMap.get(clusterIdB)!;
          const clusterA = clusterMap.get(clusterIdA)!;
          for (const nodeId of clusterB) {
            clusterA.add(nodeId);
            nodeToCluster.set(nodeId, clusterIdA);
          }
          clusterMap.delete(clusterIdB);
        } else if (clusterIdA) {
          clusterMap.get(clusterIdA)!.add(knowledgeNodes[j].id);
          nodeToCluster.set(knowledgeNodes[j].id, clusterIdA);
        } else if (clusterIdB) {
          clusterMap.get(clusterIdB)!.add(knowledgeNodes[i].id);
          nodeToCluster.set(knowledgeNodes[i].id, clusterIdB);
        } else {
          const clusterId = `cluster-${clusterMap.size + 1}`;
          clusterMap.set(clusterId, new Set([knowledgeNodes[i].id, knowledgeNodes[j].id]));
          nodeToCluster.set(knowledgeNodes[i].id, clusterId);
          nodeToCluster.set(knowledgeNodes[j].id, clusterId);
        }
      }
    }
  }

  const clusters: GraphCluster[] = [];
  for (const [clusterId, nodeIds] of clusterMap) {
    // Find dominant tags
    const tagFreq = new Map<string, number>();
    for (const nodeId of nodeIds) {
      const tags = nodeTags.get(nodeId) || new Set();
      for (const tag of tags) {
        tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1);
      }
    }
    const dominantTags = Array.from(tagFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);

    clusters.push({
      id: clusterId,
      label: dominantTags.join(', '),
      nodeIds: Array.from(nodeIds),
      dominantTags,
    });
  }

  return clusters;
}

export async function getIsolatedNodes(entityId: string): Promise<GraphNode[]> {
  const graph = await buildGraph(entityId);
  return graph.nodes.filter((n) => n.connectionCount === 0);
}
