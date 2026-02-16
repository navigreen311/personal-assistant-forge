'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Project, ProjectHealth, TaskStatus } from '@/shared/types';
import ProjectDashboard from '@/modules/tasks/components/ProjectDashboard';

interface ProjectSummary {
  project: Project;
  taskCounts: Record<TaskStatus, number>;
  completionPercent: number;
  health: ProjectHealth;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [entityFilter] = useState<string>('');
  const [healthFilter, setHealthFilter] = useState<string>('');

  const fetchProjects = useCallback(async () => {
    try {
      // Fetch projects using the list API
      // In production, this would fetch project summaries
      setProjects([]);
    } catch {
      // Handle error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = healthFilter
    ? projects.filter((p) => p.health === healthFilter)
    : projects;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-md"
          >
            <option value="">All Health</option>
            <option value="GREEN">Green</option>
            <option value="YELLOW">Yellow</option>
            <option value="RED">Red</option>
          </select>
        </div>

        <ProjectDashboard
          projects={filteredProjects}
          onProjectClick={(projectId) => router.push(`/projects/${projectId}`)}
          onCreateProject={() => {
            // Open create project modal
          }}
          entityFilter={entityFilter}
        />
      </div>
    </div>
  );
}
