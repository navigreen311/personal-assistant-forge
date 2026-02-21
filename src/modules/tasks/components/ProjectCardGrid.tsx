'use client';

import ProjectCard from './ProjectCard';

interface ProjectCardGridProps {
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    entityId: string;
    entityName?: string;
    health: string;
    status: string;
    milestones: Array<{ id: string; title: string; dueDate?: string; status: string }>;
    tasks?: { total: number; completed: number };
    teamMembers?: number;
    blockedTasks?: number;
    targetDate?: string;
    updatedAt: string;
    tags?: string[];
  }>;
  onProjectClick?: (id: string) => void;
}

export default function ProjectCardGrid({ projects, onProjectClick }: ProjectCardGridProps) {
  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        No projects to display.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onClick={onProjectClick}
        />
      ))}
    </div>
  );
}
