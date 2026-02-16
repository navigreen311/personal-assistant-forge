export interface DelegationTask {
  id: string;
  taskId: string;
  delegatedBy: string;
  delegatedTo: string;
  contextPack: ContextPack;
  approvalChain: ApprovalStep[];
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  delegatedAt: Date;
  completedAt?: Date;
}

export interface ContextPack {
  summary: string;
  relevantDocuments: string[];
  relevantMessages: string[];
  relevantContacts: string[];
  deadlines: { description: string; date: Date }[];
  notes: string;
  permissions: string[];
}

export interface ApprovalStep {
  order: number;
  approverId: string;
  approverName: string;
  role: 'AI_DRAFT' | 'EA_REVIEW' | 'USER_APPROVE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  reviewedAt?: Date;
  comments?: string;
}

export interface DelegationInboxItem {
  taskId: string;
  taskTitle: string;
  reason: string;
  suggestedDelegatee: string;
  estimatedTimeSavedMinutes: number;
  confidence: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DelegationScore {
  delegateeId: string;
  delegateeName: string;
  categories: { category: string; score: number; tasksCompleted: number; averageQuality: number }[];
  overallScore: number;
  bestCategory: string;
  totalTasksDelegated: number;
}

export interface RolePermission {
  roleId: string;
  roleName: string;
  permissions: string[];
  entityScope: string[];
  isDefault: boolean;
}
