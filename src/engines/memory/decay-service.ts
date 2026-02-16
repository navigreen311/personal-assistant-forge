import { prisma } from '@/lib/db';
import type { MemoryEntry, MemoryType } from '@/shared/types';
import type { DecayConfig } from './types';

const DEFAULT_DECAY_CONFIG: DecayConfig = {
  shortTermHalfLifeHours: 24,
  workingHalfLifeDays: 14,
  longTermHalfLifeDays: 365,
  episodicHalfLifeDays: 730,
  reinforcementBoost: 0.2,
  minimumStrength: 0.05,
};

export function getDecayConfig(overrides?: Partial<DecayConfig>): DecayConfig {
  return { ...DEFAULT_DECAY_CONFIG, ...overrides };
}

function getHalfLifeMs(type: MemoryType, config: DecayConfig): number {
  switch (type) {
    case 'SHORT_TERM':
      return config.shortTermHalfLifeHours * 60 * 60 * 1000;
    case 'WORKING':
      return config.workingHalfLifeDays * 24 * 60 * 60 * 1000;
    case 'LONG_TERM':
      return config.longTermHalfLifeDays * 24 * 60 * 60 * 1000;
    case 'EPISODIC':
      return config.episodicHalfLifeDays * 24 * 60 * 60 * 1000;
    default:
      return config.workingHalfLifeDays * 24 * 60 * 60 * 1000;
  }
}

function calculateDecayedStrength(
  currentStrength: number,
  lastAccessed: Date,
  type: MemoryType,
  config: DecayConfig
): number {
  const now = Date.now();
  const elapsed = now - lastAccessed.getTime();
  const halfLife = getHalfLifeMs(type, config);

  // Exponential decay: S(t) = S0 * (0.5)^(t/halfLife)
  const decayFactor = Math.pow(0.5, elapsed / halfLife);
  return currentStrength * decayFactor;
}

export async function applyDecay(
  userId: string,
  configOverrides?: Partial<DecayConfig>
): Promise<{ decayed: number; cleaned: number }> {
  const config = getDecayConfig(configOverrides);

  const entries = await prisma.memoryEntry.findMany({
    where: { userId },
  });

  let decayed = 0;
  let cleaned = 0;

  for (const entry of entries) {
    const newStrength = calculateDecayedStrength(
      entry.strength,
      entry.lastAccessed,
      entry.type as MemoryType,
      config
    );

    if (newStrength < config.minimumStrength) {
      // Clean up weak memories
      await prisma.memoryEntry.delete({ where: { id: entry.id } });
      cleaned++;
    } else if (Math.abs(newStrength - entry.strength) > 0.001) {
      // Update strength if it changed meaningfully
      await prisma.memoryEntry.update({
        where: { id: entry.id },
        data: { strength: newStrength },
      });
      decayed++;
    }
  }

  return { decayed, cleaned };
}

export async function reinforceMemory(
  id: string,
  boostAmount?: number
): Promise<MemoryEntry> {
  const config = getDecayConfig();
  const boost = boostAmount ?? config.reinforcementBoost;

  const entry = await prisma.memoryEntry.findUnique({ where: { id } });
  if (!entry) throw new Error(`Memory not found: ${id}`);

  const newStrength = Math.min(entry.strength + boost, 1.0);

  const updated = await prisma.memoryEntry.update({
    where: { id },
    data: {
      strength: newStrength,
      lastAccessed: new Date(),
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    type: updated.type as MemoryType,
    content: updated.content,
    context: updated.context,
    strength: updated.strength,
    lastAccessed: updated.lastAccessed,
    createdAt: updated.createdAt,
  };
}

export async function cleanupWeakMemories(
  userId: string,
  threshold?: number
): Promise<number> {
  const config = getDecayConfig();
  const minStrength = threshold ?? config.minimumStrength;

  const result = await prisma.memoryEntry.deleteMany({
    where: {
      userId,
      strength: { lt: minStrength },
    },
  });

  return result.count;
}
