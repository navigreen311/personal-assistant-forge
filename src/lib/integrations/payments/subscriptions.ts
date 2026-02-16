import { v4 as uuidv4 } from 'uuid';

// --- Types ---

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

// --- In-Memory Stores ---

const subscriptionStore = new Map<string, Subscription>();
const entitySubscriptionIndex = new Map<string, string>(); // entityId -> subscriptionId
const usageStore = new Map<string, UsageMeter[]>(); // entityId -> meters

/** Exposed for testing: clears all subscriptions and usage data. */
export function _resetStore(): void {
  subscriptionStore.clear();
  entitySubscriptionIndex.clear();
  usageStore.clear();
}

// --- Plan Lookup ---

export function getPlan(planIdOrTier: string): Plan | undefined {
  return PLANS.find((p) => p.id === planIdOrTier || p.tier === planIdOrTier);
}

// --- Subscription CRUD ---

export async function getSubscription(entityId: string): Promise<Subscription | null> {
  const subId = entitySubscriptionIndex.get(entityId);
  if (!subId) return null;
  return subscriptionStore.get(subId) ?? null;
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

  const subscription: Subscription = {
    id: uuidv4(),
    userId: params.userId,
    entityId: params.entityId,
    planId: params.planId,
    status: isTrialing ? 'trialing' : 'active',
    currentPeriodStart: now,
    currentPeriodEnd: trialEnd ?? periodEnd,
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: params.stripeSubscriptionId,
    stripeCustomerId: params.stripeCustomerId,
    createdAt: now,
    updatedAt: now,
  };

  subscriptionStore.set(subscription.id, subscription);
  entitySubscriptionIndex.set(params.entityId, subscription.id);
  return subscription;
}

export async function changePlan(params: {
  subscriptionId: string;
  newPlanId: string;
  immediate?: boolean;
}): Promise<Subscription> {
  const sub = subscriptionStore.get(params.subscriptionId);
  if (!sub) {
    throw new Error(`SUBSCRIPTION_NOT_FOUND: No subscription with id '${params.subscriptionId}'`);
  }

  if (sub.planId === params.newPlanId) {
    throw new Error('SAME_PLAN: Cannot change to the same plan');
  }

  const newPlan = getPlan(params.newPlanId);
  if (!newPlan) {
    throw new Error(`PLAN_NOT_FOUND: No plan with id '${params.newPlanId}'`);
  }

  sub.planId = params.newPlanId;
  sub.updatedAt = new Date();

  if (params.immediate) {
    const now = new Date();
    sub.currentPeriodStart = now;
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    sub.currentPeriodEnd = periodEnd;
  }

  return sub;
}

export async function cancelSubscription(params: {
  subscriptionId: string;
  immediate?: boolean;
  reason?: string;
}): Promise<Subscription> {
  const sub = subscriptionStore.get(params.subscriptionId);
  if (!sub) {
    throw new Error(`SUBSCRIPTION_NOT_FOUND: No subscription with id '${params.subscriptionId}'`);
  }

  if (params.immediate) {
    sub.status = 'cancelled';
    sub.cancelAtPeriodEnd = false;
  } else {
    sub.cancelAtPeriodEnd = true;
  }

  sub.updatedAt = new Date();
  return sub;
}

export async function resumeSubscription(subscriptionId: string): Promise<Subscription> {
  const sub = subscriptionStore.get(subscriptionId);
  if (!sub) {
    throw new Error(`SUBSCRIPTION_NOT_FOUND: No subscription with id '${subscriptionId}'`);
  }

  if (sub.status === 'cancelled') {
    throw new Error('SUBSCRIPTION_CANCELLED: Cannot resume a fully cancelled subscription');
  }

  if (!sub.cancelAtPeriodEnd) {
    throw new Error('SUBSCRIPTION_ACTIVE: Subscription is not pending cancellation');
  }

  sub.cancelAtPeriodEnd = false;
  sub.updatedAt = new Date();
  return sub;
}

// --- Feature & Limit Checks ---

export function hasFeatureAccess(entityId: string, feature: string): boolean {
  const subId = entitySubscriptionIndex.get(entityId);
  if (!subId) return false;

  const sub = subscriptionStore.get(subId);
  if (!sub || sub.status === 'cancelled') return false;

  const plan = getPlan(sub.planId);
  if (!plan) return false;

  return plan.features.includes(feature);
}

export function isWithinLimits(entityId: string, metric: string): boolean {
  const subId = entitySubscriptionIndex.get(entityId);
  if (!subId) return false;

  const sub = subscriptionStore.get(subId);
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

// --- Usage Metering ---

export async function recordUsage(params: {
  entityId: string;
  metric: string;
  count?: number;
}): Promise<UsageMeter> {
  const { entityId, metric, count = 1 } = params;

  const subId = entitySubscriptionIndex.get(entityId);
  if (!subId) {
    throw new Error(`NO_SUBSCRIPTION: Entity '${entityId}' has no active subscription`);
  }

  const sub = subscriptionStore.get(subId)!;
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
