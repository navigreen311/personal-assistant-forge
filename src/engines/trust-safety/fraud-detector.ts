import { generateJSON } from '@/lib/ai';
import type { ActionLog } from '@/shared/types';
import type { FraudHeuristic, FraudCheckResult, ThreatLevel } from './types';

const SEVERITY_RANK: Record<ThreatLevel, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function getDefaultHeuristics(): FraudHeuristic[] {
  return [
    {
      id: 'URGENT_WIRE',
      name: 'Urgent Wire Transfer',
      description: 'Wire transfer with urgent language or same-day deadline',
      triggers: ['wire', 'urgent', 'same-day', 'immediate', 'asap'],
      severity: 'HIGH',
      requiresHumanApproval: true,
    },
    {
      id: 'NEW_PAYEE',
      name: 'New Payee',
      description: 'Payment to payee not seen in last 90 days',
      triggers: ['new_payee', 'first_payment', 'unknown_recipient'],
      severity: 'MEDIUM',
      requiresHumanApproval: true,
    },
    {
      id: 'INVOICE_ANOMALY',
      name: 'Invoice Amount Anomaly',
      description: 'Invoice amount greater than 2x average for this vendor',
      triggers: ['amount_spike', 'vendor_anomaly'],
      severity: 'HIGH',
      requiresHumanApproval: true,
    },
    {
      id: 'UNUSUAL_TIME',
      name: 'Unusual Transaction Time',
      description: 'Financial transaction outside business hours (before 8am or after 6pm)',
      triggers: ['off_hours', 'weekend', 'holiday'],
      severity: 'LOW',
      requiresHumanApproval: false,
    },
    {
      id: 'RAPID_SUCCESSION',
      name: 'Rapid Succession',
      description: 'Multiple financial actions within 10 minutes',
      triggers: ['rapid_fire', 'burst_activity'],
      severity: 'MEDIUM',
      requiresHumanApproval: true,
    },
    {
      id: 'AMOUNT_THRESHOLD',
      name: 'Amount Threshold',
      description: 'Single transaction exceeding $5,000 without prior approval pattern',
      triggers: ['high_amount', 'threshold_exceeded'],
      severity: 'HIGH',
      requiresHumanApproval: true,
    },
  ];
}

export function evaluateHeuristic(
  heuristic: FraudHeuristic,
  action: ActionLog,
  history?: ActionLog[]
): boolean {
  const reason = action.reason?.toLowerCase() ?? '';
  const actionType = action.actionType?.toLowerCase() ?? '';
  const target = action.target?.toLowerCase() ?? '';
  const combined = `${reason} ${actionType} ${target}`;

  switch (heuristic.id) {
    case 'URGENT_WIRE': {
      const isWire = combined.includes('wire') || combined.includes('transfer');
      const isUrgent = combined.includes('urgent') || combined.includes('asap') ||
        combined.includes('immediate') || combined.includes('same-day');
      return isWire && isUrgent;
    }

    case 'NEW_PAYEE': {
      if (!history || history.length === 0) return false;
      const ninetyDaysAgo = new Date(action.timestamp);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const previousPayees = history
        .filter(h => h.timestamp >= ninetyDaysAgo && h.actionType.includes('payment'))
        .map(h => h.target.toLowerCase());
      return combined.includes('payment') && !previousPayees.includes(target);
    }

    case 'INVOICE_ANOMALY': {
      if (!history || history.length === 0) return false;
      if (!combined.includes('invoice')) return false;
      const vendorActions = history.filter(
        h => h.target.toLowerCase() === target && h.actionType.includes('invoice')
      );
      if (vendorActions.length === 0) return false;
      const avgCost = vendorActions.reduce((sum, h) => sum + (h.cost ?? 0), 0) / vendorActions.length;
      return (action.cost ?? 0) > avgCost * 2;
    }

    case 'UNUSUAL_TIME': {
      const hour = new Date(action.timestamp).getHours();
      const day = new Date(action.timestamp).getDay();
      const isWeekend = day === 0 || day === 6;
      const isOffHours = hour < 8 || hour >= 18;
      return (isWeekend || isOffHours) &&
        (combined.includes('payment') || combined.includes('transfer') || combined.includes('invoice'));
    }

    case 'RAPID_SUCCESSION': {
      if (!history || history.length === 0) return false;
      const tenMinutesAgo = new Date(action.timestamp);
      tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);
      const recentFinancial = history.filter(
        h => h.timestamp >= tenMinutesAgo &&
          (h.actionType.includes('payment') || h.actionType.includes('transfer') || h.actionType.includes('invoice'))
      );
      return recentFinancial.length >= 2;
    }

    case 'AMOUNT_THRESHOLD': {
      return (action.cost ?? 0) > 5000;
    }

    default:
      return false;
  }
}

export async function checkForFraud(action: ActionLog, history?: ActionLog[]): Promise<FraudCheckResult> {
  const heuristics = getDefaultHeuristics();
  const triggeredHeuristics: FraudHeuristic[] = [];

  for (const heuristic of heuristics) {
    if (evaluateHeuristic(heuristic, action, history)) {
      triggeredHeuristics.push(heuristic);
    }
  }

  // AI-powered fraud pattern analysis
  try {
    const recentHistory = (history ?? []).slice(0, 10);
    const aiResult = await generateJSON<{
      isFraudulent: boolean;
      confidence: number;
      reasoning: string;
      patterns: string[];
    }>(
      `Analyze the following action and recent history for signs of fraudulent activity.

Current action:
- Type: ${action.actionType}
- Target: ${action.target}
- Reason: ${action.reason}
- Cost: ${action.cost ?? 'N/A'}
- Timestamp: ${action.timestamp}

Recent history (${recentHistory.length} actions):
${recentHistory.map((h) => `- ${h.actionType} on ${h.target} at ${h.timestamp} (cost: ${h.cost ?? 'N/A'})`).join('\n') || 'No history available'}

Return a JSON object with:
- isFraudulent: boolean indicating if this looks like fraud
- confidence: number 0-1
- reasoning: explanation of assessment
- patterns: array of suspicious patterns detected`,
      { temperature: 0.1 }
    );

    if (aiResult.isFraudulent && aiResult.confidence > 0.7) {
      triggeredHeuristics.push({
        id: 'AI_FRAUD_DETECTION',
        name: 'AI Fraud Pattern',
        description: aiResult.reasoning,
        triggers: aiResult.patterns,
        severity: aiResult.confidence > 0.9 ? 'CRITICAL' : 'HIGH',
        requiresHumanApproval: true,
      });
    }
  } catch {
    // Fall back to heuristic-only detection on AI failure
  }

  const passed = triggeredHeuristics.length === 0;
  const overallRisk: ThreatLevel = passed
    ? 'NONE'
    : triggeredHeuristics.reduce<ThreatLevel>((max, h) =>
        SEVERITY_RANK[h.severity] > SEVERITY_RANK[max] ? h.severity : max,
      'NONE');
  const requiresApproval = triggeredHeuristics.some(h => h.requiresHumanApproval);

  return {
    passed,
    triggeredHeuristics,
    overallRisk,
    requiresApproval,
    explanation: passed
      ? 'No fraud indicators detected.'
      : `Triggered ${triggeredHeuristics.length} heuristic(s): ${triggeredHeuristics.map(h => h.name).join(', ')}. Risk: ${overallRisk}.`,
  };
}
