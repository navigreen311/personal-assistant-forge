export type ThreatLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PromptInjectionResult {
  isSafe: boolean;
  threatLevel: ThreatLevel;
  detectedPatterns: string[];
  sanitizedInput?: string;
  explanation: string;
}

export interface FraudHeuristic {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  severity: ThreatLevel;
  requiresHumanApproval: boolean;
}

export interface FraudCheckResult {
  passed: boolean;
  triggeredHeuristics: FraudHeuristic[];
  overallRisk: ThreatLevel;
  requiresApproval: boolean;
  explanation: string;
}

// P-16 / Decision 2. `ThrottleConfig` and `ThrottleStatus` were deleted with
// `throttle-service.ts` and `/api/safety/throttle`. They described an
// in-memory per-user action limiter whose only importer was its own route,
// whose only UI consumer was nothing, and whose defaults could not fire
// (`financial_tx` had `maxPerHour: 10, maxPerDay: 1`, so the hourly limit was
// unreachable; `requiresApprovalAbove: 0` with `count >= 0` always returned
// true). The control it duplicated is `ShadowProactiveConfig` enforced by
// `src/modules/shadow/proactive/notification-escalator.ts`, which counts the
// durable `ShadowOutreach` rows instead of keeping a counter and is therefore
// correct across restarts and instances by construction.
//
// Per-user limits on email volume, message volume and financial transactions
// are still unbuilt and were never enforced by the deleted file either. If they
// are wanted, they start from the same principle: count the rows that record
// the action. See docs/parallel-build/decision-02-throttle.md.

export interface ImpersonationSafeguard {
  consentVerified: boolean;
  watermarkApplied: boolean;
  disclosureIncluded: boolean;
  voiceCloneId?: string;
  consentTimestamp?: Date;
}

export interface ReputationStatus {
  channel: 'PHONE' | 'EMAIL';
  identifier: string;
  spamScore: number;
  warmingProgress?: number;
  stirShakenCompliant?: boolean;
  dkimValid?: boolean;
  spfValid?: boolean;
  dmarcValid?: boolean;
  lastChecked: Date;
}

export interface EmailHeaderAnalysis {
  fromDomain: string;
  dkimStatus: 'PASS' | 'FAIL' | 'MISSING';
  spfStatus: 'PASS' | 'FAIL' | 'MISSING';
  dmarcStatus: 'PASS' | 'FAIL' | 'MISSING';
  isSpoofed: boolean;
  riskLevel: ThreatLevel;
  details: string[];
}
