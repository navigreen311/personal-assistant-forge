import { prisma } from '@/lib/db';

// --- Types ---

/** Shape of the Prisma Subscription DB record (mirrors prisma/schema.prisma). */
interface PrismaSubscription {
  id: string;
  entityId: string;
  planId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface Plan {
  id: string;
  name: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise';
  priceMonthly: number;   // in cents
  priceYearly: number;    // in cents
  features: string[];
  limits: {
    entities: number;
    contacts: number;
    storageGb: number;
    apiCallsPerMonth: number;
    workflowsActive: number;
  };
}

export interface Subscription {
  id: string;
  userId: string;
  entityId: string;
  planId: string;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'paused';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageMeter {
  entityId: string;
  metric: string;
  count: number;
  limit: number;
  periodStart: Date;
  periodEnd: Date;
}

// --- Plans ---

export const PLANS: Plan[] = [
  {
    id: 'plan_free',
    name: 'Free',
    tier: 'free',
    priceMonthly: 0,
    priceYearly: 0,
    features: ['basic_dashboard', 'single_entity', 'email_support'],
    limits: {
      entities: 1,
      contacts: 100,
      storageGb: 1,
      apiCallsPerMonth: 1000,
      workflowsActive: 2,
    },
  },
  {
    id: 'plan_starter',
    name: 'Starter',
    tier: 'starter',
    priceMonthly: 2900,    // $29
    priceYearly: 29000,    // $290
    features: [
      'basic_dashboard', 'multiple_entities', 'email_support',
      'document_storage', 'contact_management', 'task_management',
    ],
    limits: {
      entities: 3,
      contacts: 500,
      storageGb: 10,
      apiCallsPerMonth: 10000,
      workflowsActive: 10,
    },
  },
  {
    id: 'plan_professional',
    name: 'Professional',
    tier: 'professional',
    priceMonthly: 7900,    // $79
    priceYearly: 79000,    // $790
    features: [
      'basic_dashboard', 'multiple_entities', 'priority_support',
      'document_storage', 'contact_management', 'task_management',
      'workflow_automation', 'ai_assistant', 'api_access', 'analytics',
    ],
    limits: {
      entities: 10,
      contacts: 5000,
      storageGb: 50,
      apiCallsPerMonth: 100000,
      workflowsActive: 50,
    },
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    priceMonthly: 19900,   // $199
    priceYearly: 199000,   // $1990
    features: [
      'basic_dashboard', 'unlimited_entities', 'dedicated_support',
      'document_storage', 'contact_management', 'task_management',
      'workflow_automation', 'ai_assistant', 'api_access', 'analytics',
      'custom_integrations', 'sso', 'audit_log', 'compliance_tools',
    ],
    limits: {
      entities: 100,
      contacts: 50000,
      storageGb: 500,
      apiCallsPerMonth: 1000000,
      workflowsActive: 500,
    },
  },
];

// --- In-Memory Usage Store ---
// NOTE: Usage metering is kept in-memory because there is no dedicated UsageMeter
// Prisma model. Usage resets each billing period anyway. For production, consider
// persisting usage to a dedicated table or the UsageRecord model.
const usageStore = new Map<string, UsageMeter[]>();

// --- DB <-> Local Mapping Helpers ---

/** Convert a Prisma Subscription record to the local Subscription interface. */
function mapDbToLocal(db: PrismaSubscription): Subscription {
  const metadata = (db.metadata as Record<string, unknown>) ?? {};
  return {
    id: db.id,
    userId: (metadata.userId as string) ?? '',
    entityId: db.entityId,
    planId: db.planId,
    // Normalize DB 'canceled' (single-l) to local 'cancelled' (double-l)
    status: db.status === 'canceled'
      ? 'cancelled'
      : db.status as Subscription['status'],
    currentPeriodStart: db.currentPeriodStart,
    currentPeriodEnd: db.currentPeriodEnd,
    cancelAtPeriodEnd: db.cancelAtPeriodEnd,
    stripeSubscriptionId: db.stripeSubscriptionId ?? undefined,
    stripeCustomerId: db.stripeCustomerId ?? undefined,
    createdAt: db.createdAt,
    updatedAt: db.updatedAt,
  };
}

/** Normalize local status for DB storage: 'cancelled' -> 'canceled'. */
function _normalizeStatusForDb(status: string): string {
  return status === 'cancelled' ? 'canceled' : status;
}

/** Exposed for testing: clears subscriptions from DB (test env only) and in-memory usage. */
export async function _resetStore(): Promise<void> {
  await prisma.subscription.deleteMany();
  usageStore.clear();
}

// --- Plan Lookup ---

export function getPlan(planIdOrTier: string): Plan | undefined {
  return PLANS.find((p) => p.id === planIdOrTier || p.tier === planIdOrTier);
}

// --- Subscription CRUD ---

export async function getSubscription(entityId: string): Promise<Subscription | null> {
  const record = await prisma.subscription.findFirst({
    where: { entityId },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return null;
  return mapDbToLocal(record);
}

export async function createSubscription(params: {
  userId: string;
  entityId: string;
  planId: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  trialDays?: number;
}): Promise<Subscription> {
  const plan = getPlan(params.planId);
  if (!plan) {
    throw new Error(`PLAN_NOT_FOUND: No plan with id '${params.planId}'`);
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const isTrialing = params.trialDays !== undefined && params.trialDays > 0;
  let trialEnd: Date | undefined;
  if (isTrialing) {
    trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + params.trialDays!);
  }

  const status = isTrialing ? 'trialing' : 'active';

  const record = await prisma.subscription.create({
    data: {
      entityId: params.entityId,
      planId: params.planId,
      status,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd ?? periodEnd,
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: params.stripeSubscriptionId ?? null,
      stripeCustomerId: params.stripeCustomerId ?? null,
      metadata: { userId: params.userId },
    },
  });

  return mapDbToLocal(record);
}

export async function changePlan(params: {
  subscriptionId: string;
  newPlanId: string;
  immediate?: boolean;
}): Promise<Subscription> {
  const existing = await prisma.subscription.findFirst({
    where: { id: params.subscriptionId },
  });
  if (!existing) {
    throw new Error(`SUBSCRIPTION_NOT_FOUND: No subscription with id '${params.subscriptionId}'`);
  }

  if (existing.planId === params.newPlanId) {
    throw new Error('SAME_PLAN: Cannot change to the same plan');
  }

  const newPlan = getPlan(params.newPlanId);
  if (!newPlan) {
    throw new Error(`PLAN_NOT_FOUND: No plan with id '${params.newPlanId}'`);
  }

  const updateData: Record<string, unknown> = {
    planId: params.newPlanId,
  };

  if (params.immediate) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    updateData.currentPeriodStart = now;
    updateData.currentPeriodEnd = periodEnd;
  }

  const record = await prisma.subscription.update({
    where: { id: params.subscriptionId },
    data: updateData,
  });

  return mapDbToLocal(record);
}

export async function cancelSubscription(params: {
  subscriptionId: string;
  immediate?: boolean;
  reason?: string;
}): Promise<Subscription> {
  const existing = await prisma.subscription.findFirst({
    where: { id: params.subscriptionId },
  });
  if (!existing) {
    throw new Error(`SUBSCRIPTION_NOT_FOUND: No subscription with id '${params.subscriptionId}'`);
  }

  const updateData: Record<string, unknown> = {};

  if (params.immediate) {
    updateData.status = 'canceled';
    updateData.cancelAtPeriodEnd = false;
  } else {
    updateData.cancelAtPeriodEnd = true;
  }

  const record = await prisma.subscription.update({
    where: { id: params.subscriptionId },
    data: updateData,
  });

  return mapDbToLocal(record);
}

export async function resumeSubscription(subscriptionId: string): Promise<Subscription> {
  const existing = await prisma.subscription.findFirst({
    where: { id: subscriptionId },
  });
  if (!existing) {
    throw new Error(`SUBSCRIPTION_NOT_FOUND: No subscription with id '${subscriptionId}'`);
  }

  if (existing.status === 'canceled') {
    throw new Error('SUBSCRIPTION_CANCELLED: Cannot resume a fully cancelled subscription');
  }

  if (!existing.cancelAtPeriodEnd) {
    throw new Error('SUBSCRIPTION_ACTIVE: Subscription is not pending cancellation');
  }

  const record = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { cancelAtPeriodEnd: false },
  });

  return mapDbToLocal(record);
}

// --- Feature & Limit Checks ---

export async function hasFeatureAccess(entityId: string, feature: string): Promise<boolean> {
  const sub = await getSubscription(entityId);
  if (!sub || sub.status === 'cancelled') return false;

  const plan = getPlan(sub.planId);
  if (!plan) return false;

  return plan.features.includes(feature);
}

export async function isWithinLimits(entityId: string, metric: string): Promise<boolean> {
  const sub = await getSubscription(entityId);
  if (!sub) return false;

  const plan = getPlan(sub.planId);
  if (!plan) return false;

  const limit = (plan.limits as Record<string, number>)[metric];
  if (limit === undefined) return true; // unknown metric, allow

  const meters = usageStore.get(entityId) ?? [];
  const meter = meters.find((m) => m.metric === metric);
  if (!meter) return true; // no usage recorded yet

  return meter.count < limit;
}

// --- Usage Metering (in-memory) ---

export async function recordUsage(params: {
  entityId: string;
  metric: string;
  count?: number;
}): Promise<UsageMeter> {
  const { entityId, metric, count = 1 } = params;

  const sub = await getSubscription(entityId);
  if (!sub) {
    throw new Error(`NO_SUBSCRIPTION: Entity '${entityId}' has no active subscription`);
  }

  const plan = getPlan(sub.planId);
  const limit = plan ? (plan.limits as Record<string, number>)[metric] ?? 0 : 0;

  let meters = usageStore.get(entityId);
  if (!meters) {
    meters = [];
    usageStore.set(entityId, meters);
  }

  let meter = meters.find((m) => m.metric === metric);
  if (!meter) {
    meter = {
      entityId,
      metric,
      count: 0,
      limit,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    };
    meters.push(meter);
  }

  // Reset if current period has expired
  const now = new Date();
  if (now > meter.periodEnd) {
    meter.count = 0;
    meter.periodStart = sub.currentPeriodStart;
    meter.periodEnd = sub.currentPeriodEnd;
  }

  meter.count += count;
  meter.limit = limit;

  return meter;
}

export function getUsageSummary(entityId: string): UsageMeter[] {
  return usageStore.get(entityId) ?? [];
}
