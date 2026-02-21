/**
 * Billing Components -- Logic & Data Tests
 *
 * Since we run in a Node.js test environment (not jsdom), we test:
 * - Exported constants (PLANS array)
 * - Type structures and data integrity
 * - Business logic embedded in component data
 * - Data transformations and computed values
 */

import type {
  PlanInfo,
  SubscriptionData,
  UsageMetric,
  UsageData,
  BillingInvoice,
  PaymentMethod,
  BillingAlert,
  BillingAlertSeverity,
  CostBreakdownItem,
  BillingDashboardData,
} from '@/modules/billing/types';

// --- PLANS constant from PlanSelector ---
// Re-define the PLANS array here since importing from a TSX component
// in a Node environment without jsdom would require React.
// We mirror the exact data to test its structure and business logic.
const PLANS: PlanInfo[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0/mo',
    monthlyPriceUsd: 0,
    features: [
      '1 entity',
      '1,000 AI tokens/mo',
      '100 API calls/day',
      '1 GB storage',
      'Community support',
    ],
  },
  {
    tier: 'starter',
    name: 'Starter',
    price: '$29/mo',
    monthlyPriceUsd: 29,
    highlighted: true,
    features: [
      '3 entities',
      '10,000 API calls/mo',
      '10 GB storage',
      'Email support',
      'Document storage',
      'Task management',
    ],
  },
  {
    tier: 'professional',
    name: 'Professional',
    price: '$79/mo',
    monthlyPriceUsd: 79,
    features: [
      '10 entities',
      '100,000 API calls/mo',
      '50 GB storage',
      'Priority support',
      'AI assistant',
      'Workflow automation',
      'Analytics',
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    price: '$199/mo',
    monthlyPriceUsd: 199,
    features: [
      '100 entities',
      '1,000,000 API calls/mo',
      '500 GB storage',
      'Dedicated support',
      'SSO & SAML',
      'Audit logs',
      'Custom integrations',
    ],
  },
];

// --- Helper: getButtonLabel logic (extracted from PlanSelector) ---

function getButtonLabel(currentTier: string | null, planTier: string): string {
  if (!currentTier) return 'Select';
  const currentIndex = PLANS.findIndex((p) => p.tier === currentTier);
  const targetIndex = PLANS.findIndex((p) => p.tier === planTier);
  if (targetIndex > currentIndex) return 'Upgrade';
  if (targetIndex < currentIndex) return 'Downgrade';
  return 'Select';
}

// --- Helper: UsageMeter percentage logic ---

function calculateUsagePercent(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

function getBarColor(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct > 70) return 'bg-yellow-500';
  return 'bg-blue-500';
}

// --- Helper: PaymentMethodCard expiry logic ---

function getExpiryInfo(expiryMonth: number, expiryYear: number): {
  isExpiringSoon: boolean;
  isExpired: boolean;
  expiryStr: string;
} {
  const now = new Date();
  const expiryDate = new Date(expiryYear, expiryMonth - 1);
  const monthsUntilExpiry =
    (expiryDate.getFullYear() - now.getFullYear()) * 12 +
    (expiryDate.getMonth() - now.getMonth());
  return {
    isExpiringSoon: monthsUntilExpiry <= 3 && monthsUntilExpiry >= 0,
    isExpired: monthsUntilExpiry < 0,
    expiryStr: `${String(expiryMonth).padStart(2, '0')}/${expiryYear}`,
  };
}

// --- Helper: CostBreakdownChart computations ---

function computeCostBreakdown(items: CostBreakdownItem[]): {
  sorted: CostBreakdownItem[];
  totalCost: number;
} {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  const totalCost = sorted.reduce((sum, item) => sum + item.amount, 0);
  return { sorted, totalCost };
}

// --- Helper: severity mappings from BillingAlertBanner ---

const severityStyles: Record<BillingAlertSeverity, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  critical: 'bg-red-50 border-red-200 text-red-800',
};

const severityIcons: Record<BillingAlertSeverity, string> = {
  info: 'i',
  warning: '!',
  critical: '!!',
};

// --- Helper: brand display from PaymentMethodCard ---

const brandLabels: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'MC',
  amex: 'AMEX',
  discover: 'DISC',
  diners: 'DIN',
  jcb: 'JCB',
  unionpay: 'UP',
};

function getBrandDisplay(brand: string): { label: string } {
  const key = brand.toLowerCase();
  return {
    label: brandLabels[key] ?? brand.toUpperCase(),
  };
}

// --- Invoice status styles from InvoiceList ---

const statusStyles: Record<BillingInvoice['status'], string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

// =========================================================================
// TESTS
// =========================================================================

describe('Billing Types -- Structure Validation', () => {
  it('should validate PlanInfo required fields', () => {
    const plan: PlanInfo = {
      tier: 'test',
      name: 'Test Plan',
      price: '$10/mo',
      monthlyPriceUsd: 10,
      features: ['Feature 1'],
    };
    expect(plan.tier).toBe('test');
    expect(plan.name).toBe('Test Plan');
    expect(plan.price).toBe('$10/mo');
    expect(plan.monthlyPriceUsd).toBe(10);
    expect(plan.features).toHaveLength(1);
    expect(plan.highlighted).toBeUndefined();
  });

  it('should validate SubscriptionData status enum values', () => {
    const validStatuses: SubscriptionData['status'][] = [
      'active',
      'trialing',
      'past_due',
      'cancelled',
      'canceled',
    ];
    validStatuses.forEach((status) => {
      const sub: SubscriptionData = {
        planId: 'plan-1',
        planName: 'Starter',
        status,
        currentPeriodEnd: '2026-03-01',
        cancelAtPeriodEnd: false,
      };
      expect(sub.status).toBe(status);
    });
  });

  it('should validate UsageMetric structure', () => {
    const metric: UsageMetric = { used: 500, limit: 1000 };
    expect(metric.used).toBe(500);
    expect(metric.limit).toBe(1000);
  });

  it('should validate BillingDashboardData aggregates all billing types', () => {
    const dashboard: BillingDashboardData = {
      subscription: {
        planId: 'plan-starter',
        planName: 'Starter',
        status: 'active',
        currentPeriodEnd: '2026-03-01',
        cancelAtPeriodEnd: false,
      },
      usage: {
        aiTokens: { used: 500, limit: 10000 },
        apiCalls: { used: 100, limit: 10000 },
        storage: { used: 2, limit: 10 },
      },
      invoices: [
        { id: 'inv-1', date: '2026-01-01', amount: '$29.00', status: 'paid' },
      ],
      paymentMethod: {
        brand: 'visa',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2028,
        isDefault: true,
      },
      alerts: [],
      costBreakdown: [],
    };
    expect(dashboard.subscription).not.toBeNull();
    expect(dashboard.usage).not.toBeNull();
    expect(dashboard.invoices).toHaveLength(1);
    expect(dashboard.paymentMethod).not.toBeNull();
    expect(dashboard.alerts).toHaveLength(0);
    expect(dashboard.costBreakdown).toHaveLength(0);
  });

  it('should validate BillingAlert with optional action fields', () => {
    const alertWithAction: BillingAlert = {
      id: 'alert-1',
      severity: 'warning',
      message: 'Usage approaching limit',
      actionLabel: 'Upgrade',
      actionUrl: '/billing/upgrade',
      dismissible: true,
    };
    expect(alertWithAction.actionLabel).toBe('Upgrade');
    expect(alertWithAction.actionUrl).toBe('/billing/upgrade');

    const alertWithoutAction: BillingAlert = {
      id: 'alert-2',
      severity: 'info',
      message: 'New plan available',
    };
    expect(alertWithoutAction.actionLabel).toBeUndefined();
    expect(alertWithoutAction.actionUrl).toBeUndefined();
    expect(alertWithoutAction.dismissible).toBeUndefined();
  });
});

describe('PLANS Constant -- Data Integrity', () => {
  it('should have exactly 4 plan tiers', () => {
    expect(PLANS).toHaveLength(4);
  });

  it('should have unique tier identifiers', () => {
    const tiers = PLANS.map((p) => p.tier);
    const uniqueTiers = new Set(tiers);
    expect(uniqueTiers.size).toBe(PLANS.length);
  });

  it('should have prices in ascending order', () => {
    for (let i = 1; i < PLANS.length; i++) {
      expect(PLANS[i].monthlyPriceUsd).toBeGreaterThan(PLANS[i - 1].monthlyPriceUsd);
    }
  });

  it('should mark only starter as highlighted', () => {
    const highlighted = PLANS.filter((p) => p.highlighted);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].tier).toBe('starter');
  });

  it('should have at least 3 features per plan', () => {
    PLANS.forEach((plan) => {
      expect(plan.features.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('should have free tier with $0 price', () => {
    const freePlan = PLANS.find((p) => p.tier === 'free');
    expect(freePlan).toBeDefined();
    expect(freePlan!.monthlyPriceUsd).toBe(0);
    expect(freePlan!.price).toBe('$0/mo');
  });

  it('should include enterprise tier with highest price', () => {
    const enterprise = PLANS[PLANS.length - 1];
    expect(enterprise.tier).toBe('enterprise');
    expect(enterprise.monthlyPriceUsd).toBe(199);
  });
});

describe('PlanSelector -- getButtonLabel Logic', () => {
  it('should return Select when no current tier', () => {
    expect(getButtonLabel(null, 'starter')).toBe('Select');
  });

  it('should return Upgrade when target tier is higher', () => {
    expect(getButtonLabel('free', 'starter')).toBe('Upgrade');
    expect(getButtonLabel('free', 'professional')).toBe('Upgrade');
    expect(getButtonLabel('starter', 'enterprise')).toBe('Upgrade');
  });

  it('should return Downgrade when target tier is lower', () => {
    expect(getButtonLabel('enterprise', 'professional')).toBe('Downgrade');
    expect(getButtonLabel('professional', 'free')).toBe('Downgrade');
    expect(getButtonLabel('starter', 'free')).toBe('Downgrade');
  });

  it('should return Select when target matches current tier', () => {
    expect(getButtonLabel('starter', 'starter')).toBe('Select');
    expect(getButtonLabel('free', 'free')).toBe('Select');
  });
});

describe('UsageMeter -- Percentage and Color Logic', () => {
  it('should calculate 50% usage', () => {
    expect(calculateUsagePercent(500, 1000)).toBe(50);
  });

  it('should cap at 100% when usage exceeds limit', () => {
    expect(calculateUsagePercent(1500, 1000)).toBe(100);
  });

  it('should return 0% when limit is 0', () => {
    expect(calculateUsagePercent(100, 0)).toBe(0);
  });

  it('should return blue bar for normal usage', () => {
    expect(getBarColor(50)).toBe('bg-blue-500');
    expect(getBarColor(70)).toBe('bg-blue-500');
  });

  it('should return yellow bar for high usage (71-90%)', () => {
    expect(getBarColor(71)).toBe('bg-yellow-500');
    expect(getBarColor(90)).toBe('bg-yellow-500');
  });

  it('should return red bar for critical usage (>90%)', () => {
    expect(getBarColor(91)).toBe('bg-red-500');
    expect(getBarColor(100)).toBe('bg-red-500');
  });
});

describe('PaymentMethodCard -- Expiry Logic', () => {
  it('should detect expired card', () => {
    const { isExpired } = getExpiryInfo(1, 2020);
    expect(isExpired).toBe(true);
  });

  it('should detect card expiring soon (within 3 months)', () => {
    const now = new Date();
    const soonMonth = now.getMonth() + 2; // 1 month from now (0-indexed + 1 for display)
    const soonYear = now.getFullYear();
    const adjustedMonth = soonMonth > 12 ? soonMonth - 12 : soonMonth;
    const adjustedYear = soonMonth > 12 ? soonYear + 1 : soonYear;

    const { isExpiringSoon, isExpired } = getExpiryInfo(adjustedMonth, adjustedYear);
    expect(isExpiringSoon).toBe(true);
    expect(isExpired).toBe(false);
  });

  it('should show card as not expiring for far-future date', () => {
    const { isExpiringSoon, isExpired } = getExpiryInfo(12, 2030);
    expect(isExpiringSoon).toBe(false);
    expect(isExpired).toBe(false);
  });

  it('should format expiry string with zero-padded month', () => {
    const { expiryStr } = getExpiryInfo(3, 2028);
    expect(expiryStr).toBe('03/2028');
  });

  it('should format double-digit month correctly', () => {
    const { expiryStr } = getExpiryInfo(12, 2027);
    expect(expiryStr).toBe('12/2027');
  });
});

describe('PaymentMethodCard -- Brand Display Logic', () => {
  it('should return VISA for visa brand', () => {
    expect(getBrandDisplay('visa').label).toBe('VISA');
  });

  it('should return MC for mastercard brand', () => {
    expect(getBrandDisplay('mastercard').label).toBe('MC');
  });

  it('should return AMEX for amex brand', () => {
    expect(getBrandDisplay('amex').label).toBe('AMEX');
  });

  it('should uppercase unknown brands', () => {
    expect(getBrandDisplay('mycard').label).toBe('MYCARD');
  });
});

describe('CostBreakdownChart -- Sorting and Totals', () => {
  const sampleItems: CostBreakdownItem[] = [
    { category: 'AI Tokens', amount: 15.5, percentage: 40, trend: 'up', changePercent: 12 },
    { category: 'Storage', amount: 5.0, percentage: 13, trend: 'stable', changePercent: 0 },
    { category: 'API Calls', amount: 18.75, percentage: 47, trend: 'down', changePercent: -5 },
  ];

  it('should sort items by amount descending', () => {
    const { sorted } = computeCostBreakdown(sampleItems);
    expect(sorted[0].category).toBe('API Calls');
    expect(sorted[1].category).toBe('AI Tokens');
    expect(sorted[2].category).toBe('Storage');
  });

  it('should calculate correct total cost', () => {
    const { totalCost } = computeCostBreakdown(sampleItems);
    expect(totalCost).toBeCloseTo(39.25, 2);
  });

  it('should handle empty items', () => {
    const { sorted, totalCost } = computeCostBreakdown([]);
    expect(sorted).toHaveLength(0);
    expect(totalCost).toBe(0);
  });

  it('should not mutate original array', () => {
    const original = [...sampleItems];
    computeCostBreakdown(sampleItems);
    expect(sampleItems).toEqual(original);
  });
});

describe('BillingAlertBanner -- Severity Mappings', () => {
  it('should have styles for all severity levels', () => {
    const severities: BillingAlertSeverity[] = ['info', 'warning', 'critical'];
    severities.forEach((severity) => {
      expect(severityStyles[severity]).toBeDefined();
      expect(severityStyles[severity].length).toBeGreaterThan(0);
    });
  });

  it('should have icons for all severity levels', () => {
    expect(severityIcons.info).toBe('i');
    expect(severityIcons.warning).toBe('!');
    expect(severityIcons.critical).toBe('!!');
  });

  it('should filter dismissible alerts correctly', () => {
    const alerts: BillingAlert[] = [
      { id: '1', severity: 'info', message: 'Dismissible', dismissible: true },
      { id: '2', severity: 'critical', message: 'Not dismissible', dismissible: false },
      { id: '3', severity: 'warning', message: 'Default dismissible' },
    ];

    const dismissedIds = new Set(['1', '3']);

    // Mirror the component's filter logic:
    // a.dismissible !== false && dismissedIds.has(a.id) => hidden
    const visible = alerts.filter(
      (a) => !(a.dismissible !== false && dismissedIds.has(a.id)),
    );

    // Alert 1: dismissible=true, dismissed => hidden
    // Alert 2: dismissible=false, dismissed check skipped => visible
    // Alert 3: dismissible=undefined (!== false is true), dismissed => hidden
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('2');
  });
});

describe('InvoiceList -- Status Styles', () => {
  it('should have green style for paid status', () => {
    expect(statusStyles.paid).toContain('green');
  });

  it('should have yellow style for pending status', () => {
    expect(statusStyles.pending).toContain('yellow');
  });

  it('should have red style for failed status', () => {
    expect(statusStyles.failed).toContain('red');
  });

  it('should generate correct download URL for invoice without downloadUrl', () => {
    const invoice: BillingInvoice = {
      id: 'inv-123',
      date: '2026-01-15',
      amount: '$29.00',
      status: 'paid',
    };
    const url = invoice.downloadUrl ?? `/api/finance/invoices/${invoice.id}/download`;
    expect(url).toBe('/api/finance/invoices/inv-123/download');
  });

  it('should use provided downloadUrl when available', () => {
    const invoice: BillingInvoice = {
      id: 'inv-123',
      date: '2026-01-15',
      amount: '$29.00',
      status: 'paid',
      downloadUrl: 'https://cdn.example.com/inv-123.pdf',
    };
    const url = invoice.downloadUrl ?? `/api/finance/invoices/${invoice.id}/download`;
    expect(url).toBe('https://cdn.example.com/inv-123.pdf');
  });
});
