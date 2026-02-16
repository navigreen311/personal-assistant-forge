import { checkForFraud, evaluateHeuristic, getDefaultHeuristics } from '@/engines/trust-safety/fraud-detector';
import type { ActionLog } from '@/shared/types';

function makeAction(overrides: Partial<ActionLog> = {}): ActionLog {
  return {
    id: 'action-1',
    actor: 'AI',
    actionType: 'payment',
    target: 'vendor-a',
    reason: 'Monthly payment',
    blastRadius: 'LOW',
    reversible: true,
    status: 'PENDING',
    cost: 100,
    timestamp: new Date('2026-02-15T10:00:00Z'),
    ...overrides,
  };
}

describe('checkForFraud', () => {
  it('should flag urgent wire transfers', async () => {
    const action = makeAction({
      actionType: 'wire_transfer',
      reason: 'Urgent wire needed ASAP',
      cost: 10000,
    });
    const result = await checkForFraud(action);
    expect(result.passed).toBe(false);
    expect(result.triggeredHeuristics.some((h: any) => h.id === 'URGENT_WIRE')).toBe(true);
  });

  it('should flag new payees not seen in 90 days', async () => {
    const action = makeAction({
      actionType: 'payment',
      target: 'new-vendor',
    });
    const history: ActionLog[] = [
      makeAction({ actionType: 'payment', target: 'old-vendor', timestamp: new Date('2026-01-01T10:00:00Z') }),
    ];
    const result = await checkForFraud(action, history);
    expect(result.triggeredHeuristics.some((h: any) => h.id === 'NEW_PAYEE')).toBe(true);
  });

  it('should flag invoice amounts > 2x vendor average', async () => {
    const action = makeAction({
      actionType: 'invoice_payment',
      target: 'vendor-x',
      cost: 5000,
    });
    const history: ActionLog[] = [
      makeAction({ actionType: 'invoice_payment', target: 'vendor-x', cost: 1000, timestamp: new Date('2026-02-01') }),
      makeAction({ actionType: 'invoice_payment', target: 'vendor-x', cost: 1200, timestamp: new Date('2026-02-05') }),
    ];
    const result = await checkForFraud(action, history);
    expect(result.triggeredHeuristics.some((h: any) => h.id === 'INVOICE_ANOMALY')).toBe(true);
  });

  it('should flag transactions outside business hours', async () => {
    const action = makeAction({
      actionType: 'payment',
      timestamp: new Date('2026-02-15T23:00:00Z'), // 11 PM
    });
    const result = await checkForFraud(action);
    expect(result.triggeredHeuristics.some((h: any) => h.id === 'UNUSUAL_TIME')).toBe(true);
  });

  it('should pass clean transactions', async () => {
    const action = makeAction({
      actionType: 'send_email',
      target: 'contact@example.com',
      reason: 'Follow up meeting',
      cost: 0,
    });
    const result = await checkForFraud(action);
    expect(result.passed).toBe(true);
    expect(result.overallRisk).toBe('NONE');
  });

  it('should require human approval for HIGH+ severity', async () => {
    const action = makeAction({
      actionType: 'wire_transfer',
      reason: 'Urgent wire ASAP',
      cost: 10000,
    });
    const result = await checkForFraud(action);
    expect(result.requiresApproval).toBe(true);
  });
});

describe('getDefaultHeuristics', () => {
  it('should return 6 heuristics', () => {
    const heuristics = getDefaultHeuristics();
    expect(heuristics).toHaveLength(6);
  });

  it('should include all expected heuristic IDs', () => {
    const heuristics = getDefaultHeuristics();
    const ids = heuristics.map(h => h.id);
    expect(ids).toContain('URGENT_WIRE');
    expect(ids).toContain('NEW_PAYEE');
    expect(ids).toContain('INVOICE_ANOMALY');
    expect(ids).toContain('UNUSUAL_TIME');
    expect(ids).toContain('RAPID_SUCCESSION');
    expect(ids).toContain('AMOUNT_THRESHOLD');
  });
});

describe('evaluateHeuristic - AMOUNT_THRESHOLD', () => {
  it('should flag transactions over $5000', () => {
    const heuristic = getDefaultHeuristics().find(h => h.id === 'AMOUNT_THRESHOLD')!;
    const action = makeAction({ cost: 6000 });
    expect(evaluateHeuristic(heuristic, action)).toBe(true);
  });

  it('should pass transactions under $5000', () => {
    const heuristic = getDefaultHeuristics().find(h => h.id === 'AMOUNT_THRESHOLD')!;
    const action = makeAction({ cost: 1000 });
    expect(evaluateHeuristic(heuristic, action)).toBe(false);
  });
});
