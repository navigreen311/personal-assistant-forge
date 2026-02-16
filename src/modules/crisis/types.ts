export type CrisisType = 'LEGAL_THREAT' | 'PR_ISSUE' | 'HEALTH_EMERGENCY' | 'FINANCIAL_ANOMALY' | 'DATA_BREACH' | 'CLIENT_COMPLAINT' | 'REGULATORY_INQUIRY' | 'NATURAL_DISASTER';
export type CrisisSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CrisisStatus = 'DETECTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'MITIGATED' | 'RESOLVED' | 'POST_MORTEM';

export interface CrisisEvent {
  id: string;
  userId: string;
  entityId: string;
  type: CrisisType;
  severity: CrisisSeverity;
  status: CrisisStatus;
  title: string;
  description: string;
  detectedAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  escalationChain: EscalationStep[];
  playbook?: CrisisPlaybook;
  warRoom: WarRoomState;
  postIncidentReview?: PostIncidentReview;
}

export interface CrisisDetectionSignal {
  source: string;
  signalType: string;
  confidence: number;
  rawData: Record<string, unknown>;
  timestamp: Date;
}

export interface EscalationStep {
  order: number;
  contactId?: string;
  contactName: string;
  contactMethod: 'PHONE' | 'SMS' | 'EMAIL' | 'PUSH';
  escalateAfterMinutes: number;
  status: 'PENDING' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'SKIPPED';
  notifiedAt?: Date;
  acknowledgedAt?: Date;
}

export interface EscalationChainConfig {
  crisisType: CrisisType;
  steps: Omit<EscalationStep, 'status' | 'notifiedAt' | 'acknowledgedAt'>[];
}

export interface CrisisPlaybook {
  id: string;
  name: string;
  crisisType: CrisisType;
  steps: PlaybookAction[];
  estimatedResolutionHours: number;
  lastUsed?: Date;
}

export interface PlaybookAction {
  order: number;
  title: string;
  description: string;
  actionType: 'COMMUNICATION' | 'DOCUMENTATION' | 'TECHNICAL' | 'LEGAL' | 'FINANCIAL' | 'HUMAN';
  isAutomatable: boolean;
  automationConfig?: Record<string, unknown>;
  isComplete: boolean;
  completedAt?: Date;
}

export interface WarRoomState {
  isActive: boolean;
  activatedAt?: Date;
  clearedCalendarEvents: string[];
  surfacedDocuments: string[];
  draftedComms: string[];
  participants: string[];
}

export interface PostIncidentReview {
  crisisId: string;
  timeline: { timestamp: Date; event: string; actor: string }[];
  rootCause: string;
  whatWorked: string[];
  whatFailed: string[];
  actionItems: { title: string; assignee: string; dueDate: Date; status: string }[];
  lessonsLearned: string[];
}

export interface DeadManSwitch {
  userId: string;
  isEnabled: boolean;
  checkInIntervalHours: number;
  lastCheckIn: Date;
  missedCheckIns: number;
  triggerAfterMisses: number;
  protocols: DeadManProtocol[];
}

export interface DeadManProtocol {
  order: number;
  action: string;
  contactId?: string;
  contactName: string;
  message: string;
  delayHoursAfterTrigger: number;
}

export interface PhoneTreeNode {
  contactId: string;
  contactName: string;
  phone: string;
  order: number;
  role: string;
  children: PhoneTreeNode[];
}
