import type { MemoryType, MemoryEntry } from '@/shared/types';

export interface MemorySearchQuery {
  userId: string;
  query: string;
  types?: MemoryType[];
  minStrength?: number;
  limit?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  relevanceScore: number;
  matchedTerms: string[];
}

export interface DecayConfig {
  shortTermHalfLifeHours: number;
  workingHalfLifeDays: number;
  longTermHalfLifeDays: number;
  episodicHalfLifeDays: number;
  reinforcementBoost: number;
  minimumStrength: number;
}

export interface MemoryStats {
  userId: string;
  totalEntries: number;
  byType: Record<MemoryType, number>;
  averageStrength: number;
  oldestEntry: Date;
  newestEntry: Date;
  decayedCount: number;
}
