import type {
  Entity,
  BrandKit,
  ComplianceProfile,
  ProjectHealth,
} from '@/shared/types';

// --- Input Types ---

export interface CreateEntityInput {
  name: string;
  type: string;
  complianceProfile?: ComplianceProfile[];
  brandKit?: BrandKit;
  voicePersonaId?: string;
  phoneNumbers?: string[];
}

export interface UpdateEntityInput {
  name?: string;
  type?: string;
  complianceProfile?: ComplianceProfile[];
  brandKit?: Partial<BrandKit>;
  voicePersonaId?: string;
  phoneNumbers?: string[];
}

export interface ListEntitiesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// --- Pagination ---

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Health & Metrics ---

export interface EntityHealthMetrics {
  entityId: string;
  entityName: string;
  overallHealth: ProjectHealth;
  metrics: {
    activeProjects: number;
    projectsAtRisk: number;
    openTasks: number;
    overdueTasks: number;
    pendingMessages: number;
    highPriorityItems: number;
    activeWorkflows: number;
    failedWorkflows: number;
    pendingFinancials: number;
    totalRevenue: number;
    totalExpenses: number;
    contactCount: number;
    avgRelationshipScore: number;
  };
  lastActivity: Date;
  alerts: EntityAlert[];
}

export interface EntityAlert {
  id: string;
  type:
    | 'OVERDUE_TASK'
    | 'AT_RISK_PROJECT'
    | 'OVERDUE_PAYMENT'
    | 'COMPLIANCE_GAP'
    | 'STALE_CONTACT'
    | 'WORKFLOW_FAILURE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  entityId: string;
  resourceId: string;
  resourceType: string;
  createdAt: Date;
}

// --- Dashboard ---

export interface EntityDashboardData {
  entity: Entity;
  health: EntityHealthMetrics;
  recentTasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate?: Date;
  }[];
  recentMessages: {
    id: string;
    subject?: string;
    channel: string;
    triageScore: number;
    createdAt: Date;
  }[];
  upcomingEvents: {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
  }[];
  financialSummary: {
    receivable: number;
    payable: number;
    overdue: number;
    monthlyBurn: number;
  };
  topContacts: {
    id: string;
    name: string;
    relationshipScore: number;
    lastTouch?: Date;
  }[];
}

// --- Executive View ---

export interface ExecutiveViewData {
  userId: string;
  entities: EntityHealthMetrics[];
  aggregated: {
    totalOpenTasks: number;
    totalOverdueTasks: number;
    totalPendingMessages: number;
    totalRevenue: number;
    totalExpenses: number;
    netCashFlow: number;
    criticalAlerts: EntityAlert[];
  };
  crossEntityInsights: {
    sharedVendors: { vendor: string; entities: string[] }[];
    resourceConflicts: ResourceConflict[];
    upcomingDeadlines: {
      entityName: string;
      item: string;
      dueDate: Date;
    }[];
  };
}

// --- Cross-Entity ---

export interface SharedContactResult {
  contactName: string;
  email?: string;
  phone?: string;
  appearsIn: {
    entityId: string;
    entityName: string;
    contactId: string;
    role: string;
  }[];
}

export interface ResourceConflict {
  type:
    | 'SCHEDULE_OVERLAP'
    | 'BUDGET_OVERCOMMIT'
    | 'VENDOR_CONFLICT'
    | 'DEADLINE_CLASH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  entities: string[];
  suggestedResolution: string;
}

// --- Compliance ---

export interface ComplianceStatus {
  entityId: string;
  profiles: ComplianceProfile[];
  status: 'COMPLIANT' | 'AT_RISK' | 'NON_COMPLIANT';
  checks: ComplianceCheck[];
  lastAudit?: Date;
}

export interface ComplianceCheck {
  profile: ComplianceProfile;
  requirement: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';
  details: string;
}

export interface ComplianceValidation {
  allowed: boolean;
  warnings: string[];
  blockers: string[];
}

// --- Persona ---

export interface PersonaContext {
  entityId: string;
  entityName: string;
  entityType: string;
  voicePersonaId?: string;
  brandKit?: BrandKit;
  complianceProfile: ComplianceProfile[];
  responsePrefix: string;
  toneGuidance: string;
  disclaimers: string[];
}
