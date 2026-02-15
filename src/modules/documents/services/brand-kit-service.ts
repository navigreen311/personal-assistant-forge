import type { BrandKitConfig } from '../types';

const brandKitStore = new Map<string, BrandKitConfig>();

export async function getBrandKit(entityId: string): Promise<BrandKitConfig | null> {
  return brandKitStore.get(entityId) || null;
}

export async function updateBrandKit(
  entityId: string,
  config: Partial<BrandKitConfig>
): Promise<BrandKitConfig> {
  const current = brandKitStore.get(entityId) || {
    entityId,
    primaryColor: '#000000',
    secondaryColor: '#666666',
    fontFamily: 'Arial, sans-serif',
  };

  const updated: BrandKitConfig = { ...current, ...config, entityId };
  brandKitStore.set(entityId, updated);
  return updated;
}

export { brandKitStore };
