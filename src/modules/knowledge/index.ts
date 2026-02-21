// Services
export {
  calculateLinkConfidence,
  suggestLinks,
  applyLink,
  removeLink,
} from './services/auto-linker';
export {
  generateAutoTags,
  generateTitle,
  capture,
  batchCapture,
} from './services/capture-service';
export {
  buildGraph,
  findConnections,
  detectClusters,
  getIsolatedNodes,
} from './services/graph-service';
export {
  chunkContent,
  extractKeywords,
  generateSummary,
  ingestDocument,
} from './services/ingestion-service';
export {
  addLearningItem,
  updateProgress,
  getDueForReview,
  calculateNextReview,
  recordReview,
} from './services/learning-tracker';
export {
  embedText,
  cosineSimilarity,
  calculateRelevance,
  highlightExcerpt,
  suggestRelatedQueries,
  search,
  semanticSearch,
} from './services/search-service';
export {
  createSOP,
  getSOP,
  listSOPs,
  updateSOP,
  matchSOPToContext,
  recordUsage,
} from './services/sop-service';
export {
  surfaceRelevant,
  dismissSuggestion,
  trackAccess,
} from './services/surfacing-service';

// Types
export type {
  CaptureType,
  CaptureRequest,
  CapturedEntry,
  SearchRequest,
  SearchFilters,
  SearchResult,
  SearchResponse,
  GraphNode,
  GraphEdge,
  KnowledgeGraph,
  GraphCluster,
  LinkSuggestion,
  SurfacingContext,
  SurfacedKnowledge,
  SOP,
  SOPStep,
  IngestionRequest,
  IngestionResult,
  LearningItemType,
  LearningStatus,
  LearningItem,
  SpacedRepetitionSchedule,
  StoredKnowledgeData,
  StoredSOPData,
  StoredLearningData,
} from './types';
