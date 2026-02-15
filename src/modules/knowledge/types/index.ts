// ============================================================================
// Knowledge Management Module — Type Definitions
// Module-specific types for Worker 09 (M7)
// ============================================================================

// --- Capture Types ---

export type CaptureType = 'NOTE' | 'BOOKMARK' | 'VOICE_MEMO' | 'CODE_SNIPPET' | 'QUOTE' | 'ARTICLE' | 'IMAGE_NOTE';

export interface CaptureRequest {
  entityId: string;
  type: CaptureType;
  content: string;
  title?: string;
  source: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CapturedEntry {
  id: string;
  entityId: string;
  type: CaptureType;
  title: string;
  content: string;
  source: string;
  tags: string[];
  autoTags: string[];
  linkedEntries: string[];
  createdAt: Date;
  updatedAt: Date;
}

// --- Search Types ---

export interface SearchRequest {
  entityId: string;
  query: string;
  filters?: SearchFilters;
  page?: number;
  pageSize?: number;
}

export interface SearchFilters {
  types?: CaptureType[];
  tags?: string[];
  dateRange?: { start: Date; end: Date };
  source?: string;
}

export interface SearchResult {
  entry: CapturedEntry;
  relevanceScore: number;
  matchedFields: string[];
  highlightedExcerpt: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  suggestedQueries: string[];
}

// --- Graph Types ---

export interface GraphNode {
  id: string;
  label: string;
  type: 'KNOWLEDGE' | 'CONTACT' | 'TASK' | 'PROJECT' | 'DOCUMENT' | 'TAG';
  metadata: Record<string, unknown>;
  connectionCount: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relationship: string;
  strength: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgConnections: number;
    isolatedNodes: number;
  };
}

export interface GraphCluster {
  id: string;
  label: string;
  nodeIds: string[];
  dominantTags: string[];
}

// --- Link Types ---

export interface LinkSuggestion {
  sourceId: string;
  targetId: string;
  targetType: 'KNOWLEDGE' | 'CONTACT' | 'TASK' | 'DOCUMENT';
  reason: string;
  confidence: number;
  sharedTags: string[];
  sharedKeywords: string[];
}

// --- Surfacing Types ---

export interface SurfacingContext {
  entityId: string;
  currentActivity: string;
  activeContactIds?: string[];
  activeProjectId?: string;
  currentTags?: string[];
}

export interface SurfacedKnowledge {
  entry: CapturedEntry;
  reason: string;
  relevanceScore: number;
  surfacedAt: Date;
}

// --- SOP Types ---

export interface SOP {
  id: string;
  entityId: string;
  title: string;
  description: string;
  steps: SOPStep[];
  triggerConditions: string[];
  tags: string[];
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  lastUsed?: Date;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SOPStep {
  order: number;
  instruction: string;
  notes?: string;
  estimatedMinutes?: number;
  isOptional: boolean;
}

// --- Ingestion Types ---

export interface IngestionRequest {
  entityId: string;
  filename: string;
  mimeType: string;
  content: string;
  source: string;
}

export interface IngestionResult {
  entries: CapturedEntry[];
  summary: string;
  extractedKeywords: string[];
  pageCount?: number;
  wordCount: number;
}

// --- Learning Types ---

export type LearningItemType = 'BOOK' | 'COURSE' | 'ARTICLE' | 'PODCAST' | 'VIDEO' | 'PAPER';
export type LearningStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

export interface LearningItem {
  id: string;
  entityId: string;
  title: string;
  type: LearningItemType;
  status: LearningStatus;
  progress: number;
  notes: string[];
  keyTakeaways: string[];
  startedAt?: Date;
  completedAt?: Date;
  nextReviewDate?: Date;
  reviewCount: number;
  tags: string[];
  url?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpacedRepetitionSchedule {
  itemId: string;
  nextReviewDate: Date;
  interval: number;
  easeFactor: number;
}

// --- Stored Data Shapes (JSON in DB) ---

export interface StoredKnowledgeData {
  type: CaptureType;
  title: string;
  body: string;
  autoTags: string[];
  metadata?: Record<string, unknown>;
}

export interface StoredSOPData {
  title: string;
  description: string;
  steps: SOPStep[];
  triggerConditions: string[];
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  lastUsed?: string;
  useCount: number;
}

export interface StoredLearningData {
  title: string;
  type: LearningItemType;
  status: LearningStatus;
  progress: number;
  notes: string[];
  keyTakeaways: string[];
  startedAt?: string;
  completedAt?: string;
  nextReviewDate?: string;
  reviewCount: number;
  easeFactor: number;
  interval: number;
  url?: string;
}
