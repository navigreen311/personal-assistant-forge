// ============================================================================
// Brand kit service
//
// T-018: this was one of four in-memory Maps in this module. A brand kit is
// per-entity configuration, and `Entity.brandKit Json?` already exists in the
// frozen schema, so it now reads and writes that column. No migration.
//
// The store was keyed by a raw entityId taken straight off the request, so any
// authenticated caller could read or overwrite any tenant's brand kit by
// naming it. The scope is now a VerifiedEntityId: the route proves ownership
// before a value of that type exists at all.
// ============================================================================

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { BrandKitConfig } from '../types';

const DEFAULTS: Omit<BrandKitConfig, 'entityId'> = {
  primaryColor: '#000000',
  secondaryColor: '#666666',
  fontFamily: 'Arial, sans-serif',
};

type StoredBrandKit = Partial<Omit<BrandKitConfig, 'entityId'>>;

function toConfig(entityId: string, stored: StoredBrandKit | null): BrandKitConfig {
  return { ...DEFAULTS, ...(stored ?? {}), entityId };
}

export async function getBrandKit(entityId: VerifiedEntityId): Promise<BrandKitConfig | null> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { brandKit: true },
  });

  if (!entity || entity.brandKit === null || entity.brandKit === undefined) return null;

  return toConfig(entityId, entity.brandKit as StoredBrandKit);
}

export async function updateBrandKit(
  entityId: VerifiedEntityId,
  config: Partial<BrandKitConfig>
): Promise<BrandKitConfig> {
  const existing = await getBrandKit(entityId);

  // `entityId` is dropped from the caller's payload deliberately: the scope is
  // the argument, never a field the caller can set.
  const { entityId: _requested, ...patch } = config;
  const updated = toConfig(entityId, { ...(existing ?? DEFAULTS), ...patch });

  const { entityId: _scope, ...stored } = updated;

  // updateMany, not update: a unique WHERE cannot carry the scope, and a row
  // that is not this tenant's simply is not matched.
  const result = await prisma.entity.updateMany({
    where: { id: entityId },
    data: { brandKit: stored as Prisma.InputJsonValue },
  });

  if (result.count === 0) {
    throw new Error(`Entity ${entityId} not found`);
  }

  return updated;
}
