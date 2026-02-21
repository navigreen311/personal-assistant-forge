// ============================================================================
// Billing Module — Type Definitions
//
// NOTE: Billing service logic (budget management, usage metering, cost
// attribution, model routing, provider failover) lives in the cost engine
// at src/engines/cost/. This module provides UI components and the type
// contracts they consume. See also: src/engines/cost/types.ts
// ============================================================================

// --- Plans ---

export interface PlanInfo {
  tier: string;
  name: string;
  price: string;
  monthlyPriceUsd: number;
  features: string[];
  highlighted?: boolean;
}

// --- Subscription ---

export interface SubscriptionData {
  planId: string;
  planName: string;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'canceled';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

// --- Usage ---

export interface UsageMetric {
  used: number;
  limit: number;
}

export interface UsageData {
  aiTokens: UsageMetric;
  apiCalls: UsageMetric;
  storage: UsageMetric;
}

// --- Invoices ---

export interface BillingInvoice {
  id: string;
  date: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  downloadUrl?: string;
}

// --- Payment Method ---

export interface PaymentMethod {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

// --- Alerts ---

export type BillingAlertSeverity = 'info' | 'warning' | 'critical';

export interface BillingAlert {
  id: string;
  severity: BillingAlertSeverity;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  dismissible?: boolean;
}

// --- Cost Breakdown ---

export interface CostBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

// --- Billing Dashboard (combined fetch) ---

export interface BillingDashboardData {
  subscription: SubscriptionData | null;
  usage: UsageData | null;
  invoices: BillingInvoice[];
  paymentMethod: PaymentMethod | null;
  alerts: BillingAlert[];
  costBreakdown: CostBreakdownItem[];
}
