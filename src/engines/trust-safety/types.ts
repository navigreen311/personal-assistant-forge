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

export interface ThrottleConfig {
  actionType: string;
  maxPerHour: number;
  maxPerDay: number;
  requiresApprovalAbove?: number;
  cooldownMinutes?: number;
}

export interface ThrottleStatus {
  actionType: string;
  currentHourCount: number;
  currentDayCount: number;
  maxPerHour: number;
  maxPerDay: number;
  isThrottled: boolean;
  nextAllowedAt?: Date;
  requiresApproval: boolean;
}

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
