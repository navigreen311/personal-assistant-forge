import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { Property } from '../types';

/**
 * Properties, stored on `Document` with `type = 'PROPERTY'`.
 *
 * The schema is frozen and there is no `Property` model, so this follows the
 * convention the rest of the household module already uses -- warranties,
 * subscriptions, vehicles and the shopping list are all `Document` rows with a
 * JSON `content` payload. It is a shadow use, and it is written down here rather
 * than left to be inferred.
 *
 * Before this existed, `GET /api/household/properties` returned two hardcoded
 * Las Vegas addresses through a filter written
 * `MOCK_PROPERTIES.filter((p) => p.userId === session.userId || true)`. The
 * `|| true` made the tenancy check a no-op, so the filter looked like scoping
 * while doing nothing -- and every user saw the same two invented properties.
 */

const DOCUMENT_TYPE = 'PROPERTY';

interface PropertyContent {
  name: string;
  address: string;
  city: string;
  state: string;
  type: Property['type'];
  ownership: Property['ownership'];
  moveInDate?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  monthlyCosts: Property['monthlyCosts'];
}

const ZERO_COSTS: Property['monthlyCosts'] = {
  mortgage: 0,
  insurance: 0,
  utilities: 0,
  hoa: 0,
  maintenance: 0,
};

function docToProperty(
  doc: { id: string; content: string | null },
  userId: string,
  counts: { activeTasks: number; overdueTasks: number; providerCount: number }
): Property {
  const data = (doc.content ? JSON.parse(doc.content) : {}) as Partial<PropertyContent>;
  return {
    id: doc.id,
    userId,
    name: data.name ?? '',
    address: data.address ?? '',
    city: data.city ?? '',
    state: data.state ?? '',
    type: data.type ?? 'PRIMARY',
    ownership: data.ownership ?? 'OWN',
    moveInDate: data.moveInDate ? new Date(data.moveInDate) : undefined,
    beds: data.beds,
    baths: data.baths,
    sqft: data.sqft,
    yearBuilt: data.yearBuilt,
    monthlyCosts: data.monthlyCosts ?? ZERO_COSTS,
    ...counts,
  };
}

export type PropertyDraft = Omit<
  Property,
  'id' | 'userId' | 'activeTasks' | 'overdueTasks' | 'providerCount'
>;

export async function addProperty(
  entityId: VerifiedEntityId,
  userId: string,
  property: PropertyDraft
): Promise<Property> {
  const content: PropertyContent = {
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    type: property.type,
    ownership: property.ownership,
    moveInDate: property.moveInDate ? new Date(property.moveInDate).toISOString() : undefined,
    beds: property.beds,
    baths: property.baths,
    sqft: property.sqft,
    yearBuilt: property.yearBuilt,
    monthlyCosts: property.monthlyCosts ?? ZERO_COSTS,
  };

  const created = await prisma.document.create({
    data: {
      title: property.name,
      entityId,
      type: DOCUMENT_TYPE,
      status: 'ACTIVE',
      content: JSON.stringify(content),
    },
  });

  return docToProperty(created, userId, {
    activeTasks: 0,
    overdueTasks: 0,
    providerCount: 0,
  });
}

export async function getProperties(
  entityId: VerifiedEntityId,
  userId: string
): Promise<Property[]> {
  const docs = await prisma.document.findMany({
    where: { entityId, type: DOCUMENT_TYPE, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (docs.length === 0) return [];

  // Counts are entity-wide rather than per-property: the frozen schema has no
  // column linking a maintenance Task to a property, so reporting a per-property
  // split would mean inventing the association. Entity-wide is true and says so.
  const now = new Date();
  const [maintenanceTasks, providerCount] = await Promise.all([
    prisma.task.findMany({
      where: { entityId, tags: { has: 'maintenance' }, deletedAt: null },
      select: { status: true, dueDate: true },
    }),
    prisma.contact.count({
      where: { entityId, tags: { has: 'service_provider' }, deletedAt: null },
    }),
  ]);

  const open = maintenanceTasks.filter((t) => t.status !== 'DONE');
  const counts = {
    activeTasks: open.length,
    overdueTasks: open.filter((t) => t.dueDate !== null && t.dueDate < now).length,
    providerCount,
  };

  return docs.map((doc) => docToProperty(doc, userId, counts));
}
