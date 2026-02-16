import { prisma } from '@/lib/db';
import type { Project, Milestone, TaskStatus, ProjectHealth } from '@/shared/types';

export async function createProject(params: {
  name: string;
  entityId: string;
  description?: string;
  milestones?: Milestone[];
}): Promise<Project> {
  const entity = await prisma.entity.findUnique({ where: { id: params.entityId } });
  if (!entity) {
    throw new Error(`Entity not found: ${params.entityId}`);
  }

  const project = await prisma.project.create({
    data: {
      name: params.name,
      entityId: params.entityId,
      description: params.description ?? null,
      milestones: params.milestones ? JSON.parse(JSON.stringify(params.milestones)) : [],
      status: 'TODO',
      health: 'GREEN',
    },
  });

  return mapPrismaProject(project);
}

export async function getProject(projectId: string): Promise<Project | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  return project ? mapPrismaProject(project) : null;
}

export async function updateProject(
  projectId: string,
  updates: Partial<{
    name: string;
    description: string;
    milestones: Milestone[];
    status: TaskStatus;
    health: ProjectHealth;
  }>
): Promise<Project> {
  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const data: Record<string, unknown> = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.milestones !== undefined) {
    data.milestones = JSON.parse(JSON.stringify(updates.milestones));
  }
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.health !== undefined) data.health = updates.health;

  const project = await prisma.project.update({
    where: { id: projectId },
    data,
  });

  return mapPrismaProject(project);
}

export async function deleteProject(projectId: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'CANCELLED' },
  });
}

export async function listProjects(
  entityId: string,
  filters?: { status?: string; health?: string },
  page = 1,
  pageSize = 20
): Promise<{ data: Project[]; total: number }> {
  const where: Record<string, unknown> = { entityId };
  if (filters?.status) where.status = filters.status;
  if (filters?.health) where.health = filters.health;

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return { data: projects.map(mapPrismaProject), total };
}

export async function calculateProjectHealth(projectId: string): Promise<ProjectHealth> {
  const tasks = await prisma.task.findMany({
    where: { projectId, status: { notIn: ['CANCELLED'] } },
  });

  if (tasks.length === 0) return 'GREEN';

  const now = new Date();
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'DONE').length;
  const overdueTasks = tasks.filter(
    (t) => t.dueDate && t.dueDate < now && t.status !== 'DONE'
  ).length;
  const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;

  const overdueRatio = overdueTasks / totalTasks;
  const blockedRatio = blockedTasks / totalTasks;
  const completionRatio = doneTasks / totalTasks;

  // Retrieve milestones from project
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const milestones = (project?.milestones as unknown as Milestone[]) ?? [];
  const overdueMilestones = milestones.filter(
    (m) => new Date(m.dueDate) < now && m.status !== 'DONE'
  ).length;

  // RED: >30% overdue OR >20% blocked OR overdue milestones
  if (overdueRatio > 0.3 || blockedRatio > 0.2 || overdueMilestones > 0) {
    return 'RED';
  }

  // YELLOW: >10% overdue OR >10% blocked OR completion behind schedule
  if (overdueRatio > 0.1 || blockedRatio > 0.1 || completionRatio < 0.3) {
    return 'YELLOW';
  }

  return 'GREEN';
}

export async function getProjectSummary(projectId: string): Promise<{
  project: Project;
  taskCounts: Record<TaskStatus, number>;
  completionPercent: number;
  nextMilestone?: Milestone;
  health: ProjectHealth;
}> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, status: { notIn: ['CANCELLED'] } },
  });

  const taskCounts: Record<TaskStatus, number> = {
    TODO: 0,
    IN_PROGRESS: 0,
    BLOCKED: 0,
    DONE: 0,
    CANCELLED: 0,
  };

  for (const task of tasks) {
    const status = task.status as TaskStatus;
    taskCounts[status] = (taskCounts[status] ?? 0) + 1;
  }

  const totalTasks = tasks.length;
  const completionPercent = totalTasks > 0 ? Math.round((taskCounts.DONE / totalTasks) * 100) : 0;

  const health = await calculateProjectHealth(projectId);

  const milestones = ((project.milestones as unknown as Milestone[]) ?? []);
  const now = new Date();
  const upcomingMilestones = milestones
    .filter((m) => m.status !== 'DONE' && new Date(m.dueDate) >= now)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return {
    project: mapPrismaProject(project),
    taskCounts,
    completionPercent,
    nextMilestone: upcomingMilestones[0],
    health,
  };
}

// --- Helpers ---

function mapPrismaProject(project: {
  id: string;
  name: string;
  entityId: string;
  description: string | null;
  milestones: unknown;
  status: string;
  health: string;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    id: project.id,
    name: project.name,
    entityId: project.entityId,
    description: project.description ?? undefined,
    milestones: ((project.milestones as unknown as Milestone[]) ?? []),
    status: project.status as TaskStatus,
    health: project.health as ProjectHealth,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
