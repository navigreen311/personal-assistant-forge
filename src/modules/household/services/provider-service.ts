import { generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { ServiceProvider } from '../types';

function contactToProvider(contact: {
  id: string;
  entityId: string;
  name: string;
  phone: string | null;
  email: string | null;
  preferences: unknown;
}): ServiceProvider {
  const prefs = (contact.preferences ?? {}) as Record<string, unknown>;
  return {
    id: contact.id,
    userId: contact.entityId,
    name: contact.name,
    category: (prefs.category as string) ?? '',
    phone: contact.phone ?? undefined,
    email: contact.email ?? undefined,
    rating: (prefs.rating as number) ?? 0,
    lastUsed: prefs.lastUsed ? new Date(prefs.lastUsed as string) : undefined,
    notes: prefs.notes as string | undefined,
    costHistory: (prefs.costHistory as { date: Date; amount: number; service: string }[]) ?? [],
  };
}

export async function addProvider(
  userId: string,
  provider: Omit<ServiceProvider, 'id' | 'costHistory'>
): Promise<ServiceProvider> {
  const created = await prisma.contact.create({
    data: {
      entityId: userId,
      name: provider.name,
      phone: provider.phone ?? null,
      email: provider.email ?? null,
      tags: ['service_provider'],
      preferences: {
        category: provider.category,
        rating: provider.rating,
        lastUsed: provider.lastUsed ? new Date(provider.lastUsed).toISOString() : null,
        notes: provider.notes,
        costHistory: [],
      },
    },
  });

  return contactToProvider(created);
}

export async function getProviders(userId: string, category?: string): Promise<ServiceProvider[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      entityId: userId,
      tags: { has: 'service_provider' },
      deletedAt: null,
    },
  });

  const providers: ServiceProvider[] = contacts.map(contactToProvider);
  if (category) return providers.filter((p: ServiceProvider) => p.category === category);
  return providers;
}

export async function updateProvider(
  providerId: string,
  updates: Partial<ServiceProvider>
): Promise<ServiceProvider> {
  const existing = await prisma.contact.findUnique({ where: { id: providerId } });
  if (!existing) throw new Error(`Provider ${providerId} not found`);

  const currentPrefs = (existing.preferences ?? {}) as Record<string, unknown>;
  const updated = await prisma.contact.update({
    where: { id: providerId },
    data: {
      name: updates.name ?? existing.name,
      phone: updates.phone !== undefined ? (updates.phone ?? null) : existing.phone,
      email: updates.email !== undefined ? (updates.email ?? null) : existing.email,
      preferences: {
        ...currentPrefs,
        ...(updates.category !== undefined && { category: updates.category }),
        ...(updates.rating !== undefined && { rating: updates.rating }),
        ...(updates.lastUsed !== undefined && { lastUsed: updates.lastUsed ? new Date(updates.lastUsed).toISOString() : null }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
      },
    },
  });

  return contactToProvider(updated);
}

export async function logServiceCall(
  providerId: string,
  date: Date,
  amount: number,
  service: string
): Promise<ServiceProvider> {
  const existing = await prisma.contact.findUnique({ where: { id: providerId } });
  if (!existing) throw new Error(`Provider ${providerId} not found`);

  const prefs = (existing.preferences ?? {}) as Record<string, unknown>;
  const costHistory = (prefs.costHistory as { date: string; amount: number; service: string }[]) ?? [];
  costHistory.push({ date: date.toISOString(), amount, service });

  const updated = await prisma.contact.update({
    where: { id: providerId },
    data: {
      lastTouch: date,
      preferences: {
        ...prefs,
        costHistory,
        lastUsed: date.toISOString(),
      },
    },
  });

  return contactToProvider(updated);
}

export async function getRecommendedProvider(
  userId: string,
  category: string
): Promise<{ provider: ServiceProvider; rationale: string } | null> {
  const providers = await getProviders(userId, category);
  if (providers.length === 0) return null;

  providers.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (a.lastUsed && b.lastUsed) return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    return 0;
  });

  const recommended = providers[0];

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
