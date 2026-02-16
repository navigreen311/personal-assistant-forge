import { v4 as uuidv4 } from 'uuid';
import type { ServiceProvider } from '../types';

const providerStore = new Map<string, ServiceProvider>();

export async function addProvider(
  userId: string,
  provider: Omit<ServiceProvider, 'id' | 'costHistory'>
): Promise<ServiceProvider> {
  const newProvider: ServiceProvider = {
    ...provider,
    id: uuidv4(),
    userId,
    costHistory: [],
  };
  providerStore.set(newProvider.id, newProvider);
  return newProvider;
}

export async function getProviders(userId: string, category?: string): Promise<ServiceProvider[]> {
  const all = Array.from(providerStore.values()).filter(p => p.userId === userId);
  if (category) return all.filter(p => p.category === category);
  return all;
}

export async function updateProvider(
  providerId: string,
  updates: Partial<ServiceProvider>
): Promise<ServiceProvider> {
  const provider = providerStore.get(providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);

  const updated = { ...provider, ...updates, id: provider.id };
  providerStore.set(providerId, updated);
  return updated;
}

export async function logServiceCall(
  providerId: string,
  date: Date,
  amount: number,
  service: string
): Promise<ServiceProvider> {
  const provider = providerStore.get(providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);

  provider.costHistory.push({ date, amount, service });
  provider.lastUsed = date;
  providerStore.set(providerId, provider);
  return provider;
}

export async function getRecommendedProvider(
  userId: string,
  category: string
): Promise<ServiceProvider | null> {
  const providers = await getProviders(userId, category);
  if (providers.length === 0) return null;

  // Sort by rating descending, then by last used (most recently used first)
  providers.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (a.lastUsed && b.lastUsed) return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    return 0;
  });

  return providers[0];
}
