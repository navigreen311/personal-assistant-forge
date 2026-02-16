import { v4 as uuidv4 } from 'uuid';
import { generateText } from '@/lib/ai';
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
): Promise<{ provider: ServiceProvider; rationale: string } | null> {
  const providers = await getProviders(userId, category);
  if (providers.length === 0) return null;

  // Sort by rating descending, then by last used (most recently used first)
  providers.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (a.lastUsed && b.lastUsed) return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    return 0;
  });

  const recommended = providers[0];

  // Use AI to generate recommendation rationale
  let rationale: string;
  try {
    const avgCost = recommended.costHistory.length > 0
      ? recommended.costHistory.reduce((sum, c) => sum + c.amount, 0) / recommended.costHistory.length
      : 0;

    rationale = await generateText(
      `Recommend the service provider "${recommended.name}" for ${category} services.
Rating: ${recommended.rating}/5
Last used: ${recommended.lastUsed ? new Date(recommended.lastUsed).toLocaleDateString() : 'Never'}
Average cost: $${avgCost.toFixed(2)}
Service history count: ${recommended.costHistory.length}
${providers.length > 1 ? `Compared against ${providers.length - 1} other provider(s) in the same category.` : 'Only provider in this category.'}

Provide a 1-2 sentence rationale for why this provider is recommended.`,
      {
        temperature: 0.7,
        system: 'You are a household services advisor. Provide concise, helpful rationale for provider recommendations based on their track record.',
      }
    );
  } catch {
    rationale = `Recommended based on ${recommended.rating}/5 rating${recommended.lastUsed ? ' and recent usage' : ''}.`;
  }

  return { provider: recommended, rationale };
}
