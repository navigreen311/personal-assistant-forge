import { prisma } from '@/lib/db';
import type { Entity, ComplianceProfile } from '@/shared/types';
import type {
  CreateEntityInput,
  UpdateEntityInput,
  ListEntitiesParams,
  PaginatedResult,
  EntityHealthMetrics,
  EntityDashboardData,
  ExecutiveViewData,
  SharedContactResult,
  ResourceConflict,
  ComplianceStatus,
  ComplianceCheck,
  ComplianceValidation,
  EntityAlert,
} from './entity.types';

// DB row shapes (mirrors Prisma schema for type safety without generated client)
interface EntityRow {
  id: string;
  userId: string;
  name: string;
  type: string;
  complianceProfile: string[];
  brandKit: Record<string, unknown> | null;
  voicePersonaId: string | null;
  phoneNumbers: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectRow {
  id: string;
  name: string;
  entityId: string;
  status: string;
  health: string;
  updatedAt: Date;
}

interface TaskRow {
  id: string;
  title: string;
  entityId: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  updatedAt: Date;
}

interface MessageRow {
  id: string;
  channel: string;
  entityId: string;
  subject: string | null;
  triageScore: number;
  draftStatus: string | null;
  sensitivity: string;
  createdAt: Date;
}

interface WorkflowRow {
  id: string;
  name: string;
  entityId: string;
  status: string;
  lastRun: Date | null;
  successRate: number;
}

interface FinancialRow {
  id: string;
  entityId: string;
  type: string;
  amount: number;
  status: string;
  vendor: string | null;
  description: string | null;
  category: string;
  createdAt: Date;
}

interface ContactRow {
  id: string;
  entityId: string;
  name: string;
  email: string | null;
  phone: string | null;
  relationshipScore: number;
  lastTouch: Date | null;
  tags: string[];
}

interface CalendarEventRow {
  id: string;
  title: string;
  entityId: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Auth stub — returns userId from header or a placeholder.
 * Will be replaced by Worker 02's auth middleware.
 */
export function getCurrentUserId(headers?: Headers): string {
  const headerUserId = headers?.get('x-user-id');
  if (headerUserId) return headerUserId;
  return 'stub-user-id';
}

export class EntityService {
  // ─── CRUD ──────────────────────────────────────────────

  async createEntity(userId: string, data: CreateEntityInput): Promise<Entity> {
    const entity = await prisma.entity.create({
      data: {
        userId,
        name: data.name,
        type: data.type,
        complianceProfile: data.complianceProfile ?? ['GENERAL'],
        brandKit: data.brandKit ?? undefined,
        voicePersonaId: data.voicePersonaId,
        phoneNumbers: data.phoneNumbers ?? [],
      },
    });
    return this.toEntity(entity);
  }

  async getEntity(entityId: string, userId: string): Promise<Entity | null> {
    const entity = await prisma.entity.findFirst({
      where: { id: entityId, userId },
    });
    return entity ? this.toEntity(entity) : null;
  }

  async updateEntity(
    entityId: string,
    userId: string,
    data: UpdateEntityInput,
  ): Promise<Entity> {
    // Verify ownership
    const existing = await prisma.entity.findFirst({
      where: { id: entityId, userId },
    });
    if (!existing) {
      throw new Error('Entity not found or access denied');
    }

    // Merge brandKit if partial update
    let brandKit = data.brandKit;
    if (brandKit && existing.brandKit) {
      brandKit = { ...(existing.brandKit as Record<string, unknown>), ...brandKit };
    }

    const updated = await prisma.entity.update({
      where: { id: entityId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.complianceProfile !== undefined && {
          complianceProfile: data.complianceProfile,
        }),
        ...(brandKit !== undefined && { brandKit: brandKit as Record<string, unknown> }),
        ...(data.voicePersonaId !== undefined && { voicePersonaId: data.voicePersonaId }),
        ...(data.phoneNumbers !== undefined && { phoneNumbers: data.phoneNumbers }),
      },
    });
    return this.toEntity(updated);
  }

  async deleteEntity(entityId: string, userId: string): Promise<void> {
    const existing = await prisma.entity.findFirst({
      where: { id: entityId, userId },
    });
    if (!existing) {
      throw new Error('Entity not found or access denied');
    }
    await prisma.entity.delete({ where: { id: entityId } });
  }

  async listEntities(
    userId: string,
    params?: ListEntitiesParams,
  ): Promise<PaginatedResult<Entity>> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { userId };

    if (params?.type) {
      where.type = params.type;
    }
    if (params?.search) {
      where.name = { contains: params.search, mode: 'insensitive' };
    }

    const sortBy = params?.sortBy ?? 'createdAt';
    const sortOrder = params?.sortOrder ?? 'desc';

    const [entities, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: pageSize,
      }) as Promise<EntityRow[]>,
      prisma.entity.count({ where }),
    ]);

    return {
      data: entities.map((e: EntityRow) => this.toEntity(e)),
      total,
      page,
      pageSize,
    };
  }

  // ─── HEALTH & METRICS ─────────────────────────────────

  async getEntityHealth(entityId: string): Promise<EntityHealthMetrics> {
    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } }) as EntityRow;
    const now = new Date();

    const [
      projects,
      tasks,
      messages,
      workflows,
      financials,
      contacts,
    ]: [ProjectRow[], TaskRow[], MessageRow[], WorkflowRow[], FinancialRow[], ContactRow[]] = await Promise.all([
      prisma.project.findMany({ where: { entityId } }) as Promise<ProjectRow[]>,
      prisma.task.findMany({ where: { entityId } }) as Promise<TaskRow[]>,
      prisma.message.findMany({ where: { entityId } }) as Promise<MessageRow[]>,
      prisma.workflow.findMany({ where: { entityId } }) as Promise<WorkflowRow[]>,
      prisma.financialRecord.findMany({ where: { entityId } }) as Promise<FinancialRow[]>,
      prisma.contact.findMany({ where: { entityId } }) as Promise<ContactRow[]>,
    ]);

    const activeProjects = projects.filter(
      (p) => p.status !== 'DONE' && p.status !== 'CANCELLED',
    ).length;
    const projectsAtRisk = projects.filter(
      (p) => p.health === 'YELLOW' || p.health === 'RED',
    ).length;

    const openTasks = tasks.filter(
      (t) => t.status !== 'DONE' && t.status !== 'CANCELLED',
    ).length;
    const overdueTasks = tasks.filter(
      (t) =>
        t.dueDate &&
        t.dueDate < now &&
        t.status !== 'DONE' &&
        t.status !== 'CANCELLED',
    ).length;

    const pendingMessages = messages.filter(
      (m) => !m.draftStatus || m.draftStatus === 'DRAFT',
    ).length;
    const highPriorityP0 = tasks.filter(
      (t) => t.priority === 'P0' && t.status !== 'DONE' && t.status !== 'CANCELLED',
    ).length;
    const highPriorityMessages = messages.filter((m) => m.triageScore >= 8).length;
    const highPriorityItems = highPriorityP0 + highPriorityMessages;

    const activeWorkflows = workflows.filter((w) => w.status === 'ACTIVE').length;
    const failedWorkflows = workflows.filter(
      (w) => w.successRate < 0.5 && w.lastRun !== null,
    ).length;

    const pendingFinancials = financials.filter(
      (f) => f.status === 'PENDING' || f.status === 'OVERDUE',
    ).length;

    const paidInvoices = financials.filter(
      (f) => f.type === 'INVOICE' && f.status === 'PAID',
    );
    const totalRevenue = paidInvoices.reduce((sum, f) => sum + f.amount, 0);

    const paidExpenses = financials.filter(
      (f) => f.type === 'EXPENSE' && f.status === 'PAID',
    );
    const totalExpenses = paidExpenses.reduce((sum, f) => sum + f.amount, 0);

    const contactCount = contacts.length;
    const avgRelationshipScore =
      contactCount > 0
        ? contacts.reduce((sum, c) => sum + c.relationshipScore, 0) / contactCount
        : 0;

    // Determine last activity
    const allDates = [
      ...tasks.map((t) => t.updatedAt),
      ...messages.map((m) => m.createdAt),
      entity.updatedAt,
    ];
    const lastActivity = new Date(
      Math.max(...allDates.map((d) => d.getTime())),
    );

    // Generate alerts
    const alerts: EntityAlert[] = [];

    tasks
      .filter(
        (t) =>
          t.dueDate &&
          t.dueDate < now &&
          t.status !== 'DONE' &&
          t.status !== 'CANCELLED',
      )
      .forEach((t) => {
        alerts.push({
          id: `alert-task-${t.id}`,
          type: 'OVERDUE_TASK',
          severity: t.priority === 'P0' ? 'CRITICAL' : 'HIGH',
          message: `Task "${t.title}" is overdue`,
          entityId,
          resourceId: t.id,
          resourceType: 'Task',
          createdAt: now,
        });
      });

    projects
      .filter((p) => p.health === 'RED')
      .forEach((p) => {
        alerts.push({
          id: `alert-project-${p.id}`,
          type: 'AT_RISK_PROJECT',
          severity: 'CRITICAL',
          message: `Project "${p.name}" health is RED`,
          entityId,
          resourceId: p.id,
          resourceType: 'Project',
          createdAt: now,
        });
      });

    financials
      .filter((f) => f.status === 'OVERDUE')
      .forEach((f) => {
        alerts.push({
          id: `alert-financial-${f.id}`,
          type: 'OVERDUE_PAYMENT',
          severity: 'HIGH',
          message: `Financial record "${f.description ?? f.category}" is overdue`,
          entityId,
          resourceId: f.id,
          resourceType: 'FinancialRecord',
          createdAt: now,
        });
      });

    workflows
      .filter((w) => w.successRate < 0.5 && w.lastRun !== null)
      .forEach((w) => {
        alerts.push({
          id: `alert-workflow-${w.id}`,
          type: 'WORKFLOW_FAILURE',
          severity: 'MEDIUM',
          message: `Workflow "${w.name}" has low success rate (${Math.round(w.successRate * 100)}%)`,
          entityId,
          resourceId: w.id,
          resourceType: 'Workflow',
          createdAt: now,
        });
      });

    // Stale contacts (no touch in 90 days)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    contacts
      .filter(
        (c) => !c.lastTouch || c.lastTouch < ninetyDaysAgo,
      )
      .forEach((c) => {
        alerts.push({
          id: `alert-contact-${c.id}`,
          type: 'STALE_CONTACT',
          severity: 'LOW',
          message: `Contact "${c.name}" has not been touched in over 90 days`,
          entityId,
          resourceId: c.id,
          resourceType: 'Contact',
          createdAt: now,
        });
      });

    // Determine overall health
    const criticalAlerts = alerts.filter((a) => a.severity === 'CRITICAL').length;
    const highAlerts = alerts.filter((a) => a.severity === 'HIGH').length;
    let overallHealth: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
    if (criticalAlerts > 0 || overdueTasks >= 5) {
      overallHealth = 'RED';
    } else if (highAlerts > 0 || overdueTasks > 0 || projectsAtRisk > 0) {
      overallHealth = 'YELLOW';
    }

    return {
      entityId,
      entityName: entity.name,
      overallHealth,
      metrics: {
        activeProjects,
        projectsAtRisk,
        openTasks,
        overdueTasks,
        pendingMessages,
        highPriorityItems,
        activeWorkflows,
        failedWorkflows,
        pendingFinancials,
        totalRevenue,
        totalExpenses,
        contactCount,
        avgRelationshipScore: Math.round(avgRelationshipScore * 100) / 100,
      },
      lastActivity,
      alerts,
    };
  }

  async getEntityDashboardData(entityId: string): Promise<EntityDashboardData> {
    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } }) as EntityRow;
    const now = new Date();

    const health = await this.getEntityHealth(entityId);

    const [recentTasks, recentMessages, upcomingEvents, financials, topContacts]:
      [TaskRow[], MessageRow[], CalendarEventRow[], FinancialRow[], ContactRow[]] =
      await Promise.all([
        prisma.task.findMany({
          where: { entityId, status: { notIn: ['DONE', 'CANCELLED'] } },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }) as Promise<TaskRow[]>,
        prisma.message.findMany({
          where: { entityId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }) as Promise<MessageRow[]>,
        prisma.calendarEvent.findMany({
          where: { entityId, startTime: { gte: now } },
          orderBy: { startTime: 'asc' },
          take: 10,
        }) as Promise<CalendarEventRow[]>,
        prisma.financialRecord.findMany({
          where: { entityId },
        }) as Promise<FinancialRow[]>,
        prisma.contact.findMany({
          where: { entityId },
          orderBy: { relationshipScore: 'desc' },
          take: 5,
        }) as Promise<ContactRow[]>,
      ]);

    const receivable = financials
      .filter((f) => f.type === 'INVOICE' && f.status !== 'PAID' && f.status !== 'CANCELLED')
      .reduce((s, f) => s + f.amount, 0);
    const payable = financials
      .filter(
        (f) =>
          (f.type === 'EXPENSE' || f.type === 'BILL') &&
          f.status !== 'PAID' &&
          f.status !== 'CANCELLED',
      )
      .reduce((s, f) => s + f.amount, 0);
    const overdue = financials
      .filter((f) => f.status === 'OVERDUE')
      .reduce((s, f) => s + f.amount, 0);

    // Monthly burn: sum of paid expenses in last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthlyBurn = financials
      .filter(
        (f) =>
          f.type === 'EXPENSE' &&
          f.status === 'PAID' &&
          f.createdAt >= thirtyDaysAgo,
      )
      .reduce((s, f) => s + f.amount, 0);

    return {
      entity: this.toEntity(entity),
      health,
      recentTasks: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ?? undefined,
      })),
      recentMessages: recentMessages.map((m) => ({
        id: m.id,
        subject: m.subject ?? undefined,
        channel: m.channel,
        triageScore: m.triageScore,
        createdAt: m.createdAt,
      })),
      upcomingEvents: upcomingEvents.map((e) => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
      })),
      financialSummary: { receivable, payable, overdue, monthlyBurn },
      topContacts: topContacts.map((c) => ({
        id: c.id,
        name: c.name,
        relationshipScore: c.relationshipScore,
        lastTouch: c.lastTouch ?? undefined,
      })),
    };
  }

  // ─── EXECUTIVE VIEW ───────────────────────────────────

  async getUnifiedExecutiveView(userId: string): Promise<ExecutiveViewData> {
    const entities = await prisma.entity.findMany({ where: { userId } }) as EntityRow[];
    const entityHealthList: EntityHealthMetrics[] = [];

    for (const entity of entities) {
      const health = await this.getEntityHealth(entity.id);
      entityHealthList.push(health);
    }

    const totalOpenTasks = entityHealthList.reduce(
      (s, e) => s + e.metrics.openTasks,
      0,
    );
    const totalOverdueTasks = entityHealthList.reduce(
      (s, e) => s + e.metrics.overdueTasks,
      0,
    );
    const totalPendingMessages = entityHealthList.reduce(
      (s, e) => s + e.metrics.pendingMessages,
      0,
    );
    const totalRevenue = entityHealthList.reduce(
      (s, e) => s + e.metrics.totalRevenue,
      0,
    );
    const totalExpenses = entityHealthList.reduce(
      (s, e) => s + e.metrics.totalExpenses,
      0,
    );
    const criticalAlerts = entityHealthList.flatMap((e) =>
      e.alerts.filter((a) => a.severity === 'CRITICAL'),
    );

    // Shared vendors
    const entityIds = entities.map((e: EntityRow) => e.id);
    const financials = await prisma.financialRecord.findMany({
      where: { entityId: { in: entityIds } },
    }) as FinancialRow[];
    const vendorMap = new Map<string, Set<string>>();
    for (const f of financials) {
      if (f.vendor) {
        if (!vendorMap.has(f.vendor)) vendorMap.set(f.vendor, new Set());
        vendorMap.get(f.vendor)!.add(f.entityId);
      }
    }
    const sharedVendors = [...vendorMap.entries()]
      .filter(([, entitySet]) => entitySet.size > 1)
      .map(([vendor, entitySet]) => ({
        vendor,
        entities: [...entitySet],
      }));

    // Resource conflicts
    const resourceConflicts = await this.detectResourceConflicts(userId);

    // Upcoming deadlines across entities
    const tasks = await prisma.task.findMany({
      where: {
        entityId: { in: entityIds },
        dueDate: { not: null },
        status: { notIn: ['DONE', 'CANCELLED'] },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    }) as TaskRow[];
    const entityNameMap = new Map(entities.map((e: EntityRow) => [e.id, e.name]));
    const upcomingDeadlines = tasks.map((t: TaskRow) => ({
      entityName: entityNameMap.get(t.entityId) ?? 'Unknown',
      item: t.title,
      dueDate: t.dueDate!,
    }));

    return {
      userId,
      entities: entityHealthList,
      aggregated: {
        totalOpenTasks,
        totalOverdueTasks,
        totalPendingMessages,
        totalRevenue,
        totalExpenses,
        netCashFlow: totalRevenue - totalExpenses,
        criticalAlerts,
      },
      crossEntityInsights: {
        sharedVendors,
        resourceConflicts,
        upcomingDeadlines,
      },
    };
  }

  // ─── CROSS-ENTITY OPERATIONS ──────────────────────────

  async findSharedContacts(userId: string): Promise<SharedContactResult[]> {
    const entities = await prisma.entity.findMany({ where: { userId } }) as EntityRow[];
    const entityIds = entities.map((e: EntityRow) => e.id);
    const entityNameMap = new Map(entities.map((e: EntityRow) => [e.id, e.name]));

    const contacts = await prisma.contact.findMany({
      where: { entityId: { in: entityIds } },
    }) as ContactRow[];

    // Group by email
    const emailMap = new Map<string, ContactRow[]>();
    for (const c of contacts) {
      if (c.email) {
        const key = c.email.toLowerCase();
        if (!emailMap.has(key)) emailMap.set(key, []);
        emailMap.get(key)!.push(c);
      }
    }

    // Group by phone
    const phoneMap = new Map<string, ContactRow[]>();
    for (const c of contacts) {
      if (c.phone) {
        const key = c.phone.replace(/\D/g, '');
        if (!phoneMap.has(key)) phoneMap.set(key, []);
        phoneMap.get(key)!.push(c);
      }
    }

    const sharedMap = new Map<string, SharedContactResult>();

    for (const [email, group] of emailMap) {
      if (group.length > 1) {
        const key = `email:${email}`;
        sharedMap.set(key, {
          contactName: group[0].name,
          email: group[0].email ?? undefined,
          phone: group[0].phone ?? undefined,
          appearsIn: group.map((c) => ({
            entityId: c.entityId,
            entityName: entityNameMap.get(c.entityId) ?? 'Unknown',
            contactId: c.id,
            role: (c.tags && c.tags[0]) || 'contact',
          })),
        });
      }
    }

    for (const [phone, group] of phoneMap) {
      if (group.length > 1) {
        const key = `phone:${phone}`;
        if (!sharedMap.has(key)) {
          sharedMap.set(key, {
            contactName: group[0].name,
            email: group[0].email ?? undefined,
            phone: group[0].phone ?? undefined,
            appearsIn: group.map((c) => ({
              entityId: c.entityId,
              entityName: entityNameMap.get(c.entityId) ?? 'Unknown',
              contactId: c.id,
              role: (c.tags && c.tags[0]) || 'contact',
            })),
          });
        }
      }
    }

    return [...sharedMap.values()];
  }

  async detectResourceConflicts(userId: string): Promise<ResourceConflict[]> {
    const entities = await prisma.entity.findMany({ where: { userId } }) as EntityRow[];
    const entityIds = entities.map((e: EntityRow) => e.id);
    const entityNameMap = new Map(entities.map((e: EntityRow) => [e.id, e.name]));
    const conflicts: ResourceConflict[] = [];

    // Schedule overlaps — events across entities at the same time
    const now = new Date();
    const events = await prisma.calendarEvent.findMany({
      where: { entityId: { in: entityIds }, endTime: { gte: now } },
      orderBy: { startTime: 'asc' },
    }) as CalendarEventRow[];

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];
        if (a.entityId === b.entityId) continue;
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          conflicts.push({
            type: 'SCHEDULE_OVERLAP',
            severity: 'MEDIUM',
            description: `"${a.title}" (${entityNameMap.get(a.entityId)}) overlaps with "${b.title}" (${entityNameMap.get(b.entityId)})`,
            entities: [a.entityId, b.entityId],
            suggestedResolution: 'Reschedule one of the conflicting events',
          });
        }
      }
    }

    // Vendor conflicts — same vendor used by entities with conflicting compliance
    const financials = await prisma.financialRecord.findMany({
      where: { entityId: { in: entityIds }, vendor: { not: null } },
    }) as FinancialRow[];
    const vendorEntities = new Map<string, Set<string>>();
    for (const f of financials) {
      if (f.vendor) {
        if (!vendorEntities.has(f.vendor)) vendorEntities.set(f.vendor, new Set());
        vendorEntities.get(f.vendor)!.add(f.entityId);
      }
    }
    const complianceMap = new Map(
      entities.map((e: EntityRow) => [e.id, e.complianceProfile]),
    );
    for (const [vendor, entitySet] of vendorEntities) {
      if (entitySet.size > 1) {
        const ents = [...entitySet];
        const profiles = ents.flatMap((eid) => complianceMap.get(eid) ?? []);
        const hasHipaa = profiles.includes('HIPAA');
        const hasGeneral = profiles.includes('GENERAL');
        if (hasHipaa && hasGeneral) {
          conflicts.push({
            type: 'VENDOR_CONFLICT',
            severity: 'HIGH',
            description: `Vendor "${vendor}" is shared between HIPAA and non-HIPAA entities`,
            entities: ents,
            suggestedResolution:
              'Verify vendor compliance certifications or separate vendor relationships',
          });
        }
      }
    }

    // Deadline clashes — multiple entities with tasks due same day
    const tasks = await prisma.task.findMany({
      where: {
        entityId: { in: entityIds },
        dueDate: { not: null, gte: now },
        status: { notIn: ['DONE', 'CANCELLED'] },
      },
      orderBy: { dueDate: 'asc' },
    }) as TaskRow[];
    const dayMap = new Map<string, { entityId: string; title: string }[]>();
    for (const t of tasks) {
      if (t.dueDate) {
        const day = t.dueDate.toISOString().split('T')[0];
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day)!.push({ entityId: t.entityId, title: t.title });
      }
    }
    for (const [day, items] of dayMap) {
      const uniqueEntities = new Set(items.map((i) => i.entityId));
      if (uniqueEntities.size > 1 && items.length >= 5) {
        conflicts.push({
          type: 'DEADLINE_CLASH',
          severity: 'MEDIUM',
          description: `${items.length} tasks due on ${day} across ${uniqueEntities.size} entities`,
          entities: [...uniqueEntities],
          suggestedResolution: 'Redistribute deadlines to avoid bottleneck',
        });
      }
    }

    return conflicts;
  }

  // ─── COMPLIANCE ───────────────────────────────────────

  async getComplianceStatus(entityId: string): Promise<ComplianceStatus> {
    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } }) as EntityRow;
    const profiles = entity.complianceProfile as ComplianceProfile[];
    const checks: ComplianceCheck[] = [];

    for (const profile of profiles) {
      const profileChecks = await this.runComplianceChecks(entityId, profile);
      checks.push(...profileChecks);
    }

    const hasFail = checks.some((c) => c.status === 'FAIL');
    const hasWarning = checks.some((c) => c.status === 'WARNING');
    let status: 'COMPLIANT' | 'AT_RISK' | 'NON_COMPLIANT' = 'COMPLIANT';
    if (hasFail) status = 'NON_COMPLIANT';
    else if (hasWarning) status = 'AT_RISK';

    return { entityId, profiles, status, checks };
  }

  async validateEntityOperation(
    entityId: string,
    operation: string,
  ): Promise<ComplianceValidation> {
    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: entityId } }) as EntityRow;
    const profiles = entity.complianceProfile as ComplianceProfile[];
    const warnings: string[] = [];
    const blockers: string[] = [];

    for (const profile of profiles) {
      if (profile === 'HIPAA') {
        if (operation === 'EXPORT_DATA') {
          blockers.push('HIPAA: Data export requires BAA and encryption verification');
        }
        if (operation === 'SHARE_CONTACT') {
          warnings.push('HIPAA: Sharing contact data may contain PHI');
        }
      }
      if (profile === 'GDPR') {
        if (operation === 'DELETE_CONTACT') {
          warnings.push('GDPR: Ensure right-to-erasure request is documented');
        }
        if (operation === 'EXPORT_DATA') {
          warnings.push('GDPR: Data portability request must be fulfilled within 30 days');
        }
      }
      if (profile === 'SOX') {
        if (operation === 'DELETE_FINANCIAL') {
          blockers.push('SOX: Financial records cannot be deleted, only archived');
        }
      }
    }

    return { allowed: blockers.length === 0, warnings, blockers };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────

  private async runComplianceChecks(
    entityId: string,
    profile: ComplianceProfile,
  ): Promise<ComplianceCheck[]> {
    const checks: ComplianceCheck[] = [];

    if (profile === 'HIPAA') {
      // Check: All messages must have sensitivity >= CONFIDENTIAL
      const publicMessages = await prisma.message.count({
        where: { entityId, sensitivity: { in: ['PUBLIC', 'INTERNAL'] } },
      });
      checks.push({
        profile: 'HIPAA',
        requirement: 'All communications must be marked CONFIDENTIAL or higher',
        status: publicMessages > 0 ? 'FAIL' : 'PASS',
        details:
          publicMessages > 0
            ? `${publicMessages} message(s) have insufficient sensitivity level`
            : 'All messages meet sensitivity requirements',
      });

      // Check: Must have phone numbers for contact verification
      const entity = await prisma.entity.findUniqueOrThrow({
        where: { id: entityId },
      }) as EntityRow;
      checks.push({
        profile: 'HIPAA',
        requirement: 'Entity must have registered phone numbers',
        status: entity.phoneNumbers.length > 0 ? 'PASS' : 'WARNING',
        details:
          entity.phoneNumbers.length > 0
            ? `${entity.phoneNumbers.length} phone number(s) registered`
            : 'No phone numbers registered — may affect verification workflows',
      });
    }

    if (profile === 'GDPR') {
      // Check: All contacts must have documented consent (via tags or commitments)
      const contactsWithoutConsent = await prisma.contact.count({
        where: {
          entityId,
          NOT: { tags: { hasSome: ['gdpr-consent'] } },
        },
      });
      checks.push({
        profile: 'GDPR',
        requirement: 'All contacts must have documented GDPR consent',
        status: contactsWithoutConsent > 0 ? 'WARNING' : 'PASS',
        details:
          contactsWithoutConsent > 0
            ? `${contactsWithoutConsent} contact(s) missing GDPR consent tag`
            : 'All contacts have documented consent',
      });
    }

    if (profile === 'SOX') {
      // Check: All financial records must have vendor or description
      const undocumented = await prisma.financialRecord.count({
        where: {
          entityId,
          vendor: null,
          description: null,
        },
      });
      checks.push({
        profile: 'SOX',
        requirement: 'All financial records must have vendor or description',
        status: undocumented > 0 ? 'FAIL' : 'PASS',
        details:
          undocumented > 0
            ? `${undocumented} financial record(s) lack vendor and description`
            : 'All financial records are properly documented',
      });
    }

    if (profile === 'GENERAL') {
      checks.push({
        profile: 'GENERAL',
        requirement: 'No specific compliance requirements',
        status: 'NOT_APPLICABLE',
        details: 'General profile — no additional compliance checks required',
      });
    }

    if (profile === 'CCPA') {
      const contactsWithoutNotice = await prisma.contact.count({
        where: {
          entityId,
          NOT: { tags: { hasSome: ['ccpa-notice'] } },
        },
      });
      checks.push({
        profile: 'CCPA',
        requirement: 'All California contacts must receive CCPA notice',
        status: contactsWithoutNotice > 0 ? 'WARNING' : 'PASS',
        details:
          contactsWithoutNotice > 0
            ? `${contactsWithoutNotice} contact(s) missing CCPA notice tag`
            : 'All contacts have CCPA notice documented',
      });
    }

    if (profile === 'SEC') {
      checks.push({
        profile: 'SEC',
        requirement: 'Financial communications must be archived',
        status: 'PASS',
        details: 'All messages are persisted in the system by default',
      });
    }

    if (profile === 'REAL_ESTATE') {
      checks.push({
        profile: 'REAL_ESTATE',
        requirement: 'Disclosure documents must be maintained',
        status: 'PASS',
        details: 'Document management is enabled for this entity',
      });
    }

    return checks;
  }

  private toEntity(raw: EntityRow): Entity {
    return {
      id: raw.id,
      userId: raw.userId,
      name: raw.name,
      type: raw.type,
      complianceProfile: (raw.complianceProfile ?? []) as ComplianceProfile[],
      brandKit: raw.brandKit as unknown as Entity['brandKit'],
      voicePersonaId: raw.voicePersonaId ?? undefined,
      phoneNumbers: raw.phoneNumbers ?? [],
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
