'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Project, ProjectHealth, TaskStatus, Entity } from '@/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'cards' | 'list' | 'board';
type SortKey = 'health' | 'name' | 'dueDate' | 'updatedAt';

interface ProjectSummary {
  project: Project;
  taskCounts: Record<TaskStatus, number>;
  completionPercent: number;
  health: ProjectHealth;
}

interface ProjectFilters {
  search: string;
  entityId: string;
  health: string;
  status: string;
}

interface ProjectStats {
  total: number;
  onTrack: number;
  atRisk: number;
  completed: number;
}

// ---------------------------------------------------------------------------
// Dynamic imports for view components
// ---------------------------------------------------------------------------

const ProjectCardGrid = dynamic(
  () => import('@/modules/tasks/components/ProjectCardGrid'),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-lg p-4 h-40" />
        ))}
      </div>
    ),
  },
);

const ProjectListView = dynamic(
  () => import('@/modules/tasks/components/ProjectListView'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-lg h-16" />
        ))}
      </div>
    ),
  },
);

const ProjectBoardView = dynamic(
  () => import('@/modules/tasks/components/ProjectBoardView'),
  {
    ssr: false,
    loading: () => (
      <div className="flex gap-4 overflow-x-auto">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-gray-100 rounded-lg w-80 h-96 shrink-0" />
        ))}
      </div>
    ),
  },
);

const NewProjectModal = dynamic(
  () => import('@/modules/tasks/components/NewProjectModal'),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Health config
// ---------------------------------------------------------------------------

const HEALTH_CONFIG: Record<ProjectHealth, { label: string; color: string; bg: string; order: number }> = {
  RED: { label: 'At Risk', color: 'text-red-700', bg: 'bg-red-100', order: 0 },
  YELLOW: { label: 'Warning', color: 'text-yellow-700', bg: 'bg-yellow-100', order: 1 },
  GREEN: { label: 'On Track', color: 'text-green-700', bg: 'bg-green-100', order: 2 },
};

const INITIAL_FILTERS: ProjectFilters = {
  search: '',
  entityId: '',
  health: '',
  status: '',
};

// ---------------------------------------------------------------------------
// Inline fallback card grid (used if dynamic ProjectCardGrid fails)
// ---------------------------------------------------------------------------

function InlineCardGrid({
  projects,
  onProjectClick,
}: {
  projects: ProjectSummary[];
  onProjectClick: (id: string) => void;
}) {
  const totalTasks = (counts: Record<TaskStatus, number>) =>
    Object.values(counts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((item) => {
        const { project, taskCounts, completionPercent, health } = item;
        const hc = HEALTH_CONFIG[health];
        const total = totalTasks(taskCounts);
        const nextMilestone = (project.milestones ?? []).find(
          (m) => m.status !== 'DONE',
        );

        return (
          <div
            key={project.id}
            onClick={() => onProjectClick(project.id)}
            className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">
                {project.name}
              </h3>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hc.bg} ${hc.color}`}>
                {hc.label}
              </span>
            </div>

            {project.description && (
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">{project.description}</p>
            )}

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Completion</span>
                <span className="text-xs font-medium text-gray-700">{completionPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    health === 'RED' ? 'bg-red-500' :
                    health === 'YELLOW' ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3 text-[10px]">
              <span className="text-gray-500">{total} tasks</span>
              <span className="text-gray-300">|</span>
              <span className="text-green-600">{taskCounts.DONE} done</span>
              <span className="text-blue-600">{taskCounts.IN_PROGRESS} active</span>
              {taskCounts.BLOCKED > 0 && (
                <span className="text-red-600">{taskCounts.BLOCKED} blocked</span>
              )}
            </div>

            {nextMilestone && (
              <div className="text-xs text-gray-500 border-t border-gray-100 pt-2">
                Next: <span className="font-medium">{nextMilestone.title}</span>
                <span className="ml-1 text-gray-400">
                  ({new Date(nextMilestone.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const router = useRouter();

  // Data state
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [filters, setFilters] = useState<ProjectFilters>(INITIAL_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortBy, setSortBy] = useState<SortKey>('health');

  // Modal state
  const [showNewProject, setShowNewProject] = useState(false);

  // Track if dynamic card grid failed
  const [cardGridFailed, setCardGridFailed] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.entityId) params.set('entityId', filters.entityId);
      if (filters.health) params.set('health', filters.health);
      if (filters.status) params.set('status', filters.status);

      const res = await fetch(`/api/projects?${params.toString()}`);
      const json = await res.json();

      if (json.success === false) {
        throw new Error(json.error?.message ?? 'Failed to load projects');
      }

      // Normalize response - API may return data as project summaries or raw projects
      const data: ProjectSummary[] = (json.data ?? []).map((item: ProjectSummary | Project) => {
        if ('project' in item) return item;
        // Wrap raw Project into ProjectSummary
        const p = item as Project;
        return {
          project: p,
          taskCounts: { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0, CANCELLED: 0 },
          completionPercent: p.status === 'DONE' ? 100 : 0,
          health: p.health,
        };
      });

      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, [filters.search, filters.entityId, filters.health, filters.status]);

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/entities');
      const json = await res.json();
      if (json.data) {
        setEntities(json.data);
      }
    } catch {
      // Entities are optional for filter dropdown
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // ---------------------------------------------------------------------------
  // Computed stats
  // ---------------------------------------------------------------------------

  const stats: ProjectStats = useMemo(() => {
    const total = projects.length;
    const onTrack = projects.filter((p) => p.health === 'GREEN').length;
    const atRisk = projects.filter((p) => p.health === 'RED' || p.health === 'YELLOW').length;
    const completed = projects.filter((p) => p.project.status === 'DONE').length;
    return { total, onTrack, atRisk, completed };
  }, [projects]);

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      switch (sortBy) {
        case 'health':
          return HEALTH_CONFIG[a.health].order - HEALTH_CONFIG[b.health].order;
        case 'name':
          return a.project.name.localeCompare(b.project.name);
        case 'dueDate': {
          const aDue = a.project.milestones?.find((m) => m.status !== 'DONE')?.dueDate;
          const bDue = b.project.milestones?.find((m) => m.status !== 'DONE')?.dueDate;
          if (!aDue && !bDue) return 0;
          if (!aDue) return 1;
          if (!bDue) return -1;
          return new Date(aDue).getTime() - new Date(bDue).getTime();
        }
        case 'updatedAt':
          return new Date(b.project.updatedAt).getTime() - new Date(a.project.updatedAt).getTime();
        default:
          return 0;
      }
    });
  }, [projects, sortBy]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-10 w-36 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
        {/* Cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-lg p-4 h-40" />
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Page header                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track milestones, monitor health, and manage work across all entities.
          </p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          + New Project
        </button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Stats bar                                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Projects</p>
          <p className="text-2xl font-bold text-gray-600 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">On Track</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.onTrack}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">At Risk</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.atRisk}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.completed}</p>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Filter bar                                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search projects..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Entity dropdown */}
          <select
            value={filters.entityId}
            onChange={(e) => setFilters({ ...filters, entityId: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Entities</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>

          {/* Health dropdown */}
          <select
            value={filters.health}
            onChange={(e) => setFilters({ ...filters, health: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Health</option>
            <option value="GREEN">Healthy</option>
            <option value="YELLOW">At Risk</option>
            <option value="RED">Critical</option>
          </select>

          {/* Status dropdown */}
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Status</option>
            <option value="IN_PROGRESS">Active</option>
            <option value="BLOCKED">On Hold</option>
            <option value="DONE">Completed</option>
            <option value="CANCELLED">Archived</option>
          </select>

          {/* View toggle */}
          <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'cards' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Card view"
            >
              {/* Grid/cards icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
              title="List view"
            >
              {/* List icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h16M4 18h16"
                />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'board' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Board view"
            >
              {/* Board/kanban icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
            </button>
          </div>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="health">Sort: Health</option>
            <option value="name">Sort: Name A-Z</option>
            <option value="dueDate">Sort: Due Date</option>
            <option value="updatedAt">Sort: Last Updated</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
          <button
            onClick={fetchProjects}
            className="ml-3 text-red-800 underline hover:no-underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Content area                                                       */}
      {/* ----------------------------------------------------------------- */}
      {sortedProjects.length === 0 && !error ? (
        /* ----- Empty state ----- */
        <div className="flex flex-col items-center justify-center py-20 px-4">
          {/* Folder icon */}
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">No projects yet</h3>
          <p className="text-sm text-gray-500 text-center max-w-md mb-6">
            Projects help you organize milestones, track health, and coordinate tasks
            across your entities. Create your first project to get started.
          </p>

          <button
            onClick={() => setShowNewProject(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm mb-8"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + Create Your First Project
          </button>

          {/* Template quick-starts */}
          <div className="w-full max-w-lg">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 text-center">
              Or start from a template
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setShowNewProject(true)}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Client Onboarding</p>
                  <p className="text-xs text-gray-500">Standard client setup flow</p>
                </div>
              </button>

              <button
                onClick={() => setShowNewProject(true)}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Product Launch</p>
                  <p className="text-xs text-gray-500">Launch plan with milestones</p>
                </div>
              </button>

              <button
                onClick={() => setShowNewProject(true)}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Business Setup</p>
                  <p className="text-xs text-gray-500">Entity formation checklist</p>
                </div>
              </button>

              <button
                onClick={() => setShowNewProject(true)}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-amber-300 hover:bg-amber-50 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Compliance Audit</p>
                  <p className="text-xs text-gray-500">Regulatory review workflow</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ----- Project views ----- */
        <div>
          {viewMode === 'cards' && (
            cardGridFailed ? (
              <InlineCardGrid
                projects={sortedProjects}
                onProjectClick={(id) => router.push(`/projects/${id}`)}
              />
            ) : (
              <ErrorBoundaryWrapper onError={() => setCardGridFailed(true)}>
                <ProjectCardGrid
                  projects={sortedProjects.map((s) => ({
                    id: s.project.id,
                    name: s.project.name,
                    description: s.project.description ?? undefined,
                    entityId: s.project.entityId,
                    entityName: (s.project as any).entity?.name,
                    health: s.health,
                    status: s.project.status,
                    milestones: (s.project.milestones ?? []).map((m: any) => ({
                      id: m.id ?? m.title,
                      title: m.title,
                      dueDate: m.dueDate,
                      status: m.status ?? 'TODO',
                    })),
                    tasks: { total: Object.values(s.taskCounts).reduce((a, b) => a + b, 0), completed: s.taskCounts.DONE ?? 0 },
                    updatedAt: s.project.updatedAt?.toString() ?? new Date().toISOString(),
                  }))}
                  onProjectClick={(id: string) => router.push(`/projects/${id}`)}
                />
              </ErrorBoundaryWrapper>
            )
          )}

          {viewMode === 'list' && (
            <ProjectListView
              projects={sortedProjects.map((s) => ({
                id: s.project.id,
                name: s.project.name,
                entityName: (s.project as any).entity?.name,
                health: s.health,
                status: s.project.status,
                tasks: { total: Object.values(s.taskCounts).reduce((a, b) => a + b, 0), completed: s.taskCounts.DONE ?? 0 },
                targetDate: (s.project.milestones ?? []).find((m: any) => m.status !== 'DONE')?.dueDate?.toString(),
                updatedAt: s.project.updatedAt?.toString() ?? new Date().toISOString(),
              }))}
              sortBy={sortBy}
              sortOrder="asc"
              onSort={(field: string) => setSortBy(field as SortKey)}
              onProjectClick={(id: string) => router.push(`/projects/${id}`)}
            />
          )}

          {viewMode === 'board' && (
            <ProjectBoardView
              projects={sortedProjects.map((s) => ({
                id: s.project.id,
                name: s.project.name,
                description: s.project.description ?? undefined,
                entityName: (s.project as any).entity?.name,
                health: s.health,
                status: s.project.status,
                tasks: { total: Object.values(s.taskCounts).reduce((a, b) => a + b, 0), completed: s.taskCounts.DONE ?? 0 },
                targetDate: (s.project.milestones ?? []).find((m: any) => m.status !== 'DONE')?.dueDate?.toString(),
                updatedAt: s.project.updatedAt?.toString() ?? new Date().toISOString(),
              }))}
              onProjectClick={(id: string) => router.push(`/projects/${id}`)}
            />
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* New Project Modal                                                  */}
      {/* ----------------------------------------------------------------- */}
      {showNewProject && (
        <NewProjectModal
          isOpen={showNewProject}
          onClose={() => setShowNewProject(false)}
          onCreated={() => {
            setShowNewProject(false);
            fetchProjects();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple error boundary wrapper for dynamic imports
// ---------------------------------------------------------------------------

interface ErrorBoundaryWrapperProps {
  children: React.ReactNode;
  onError: () => void;
}

interface ErrorBoundaryWrapperState {
  hasError: boolean;
}

class ErrorBoundaryWrapper extends React.Component<ErrorBoundaryWrapperProps, ErrorBoundaryWrapperState> {
  constructor(props: ErrorBoundaryWrapperProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryWrapperState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
