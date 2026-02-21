'use client';

interface ProjectCardProps {
  project: {
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
  };
  onClick?: (id: string) => void;
}

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
}

function getHealthColor(health: string): string {
  switch (health.toUpperCase()) {
    case 'GREEN':
      return 'bg-green-500';
    case 'YELLOW':
      return 'bg-amber-500';
    case 'RED':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

function getHealthLabel(health: string): string {
  switch (health.toUpperCase()) {
    case 'GREEN':
      return 'On Track';
    case 'YELLOW':
      return 'At Risk';
    case 'RED':
      return 'Off Track';
    default:
      return health;
  }
}

function getHealthTextColor(health: string): string {
  switch (health.toUpperCase()) {
    case 'GREEN':
      return 'text-green-700';
    case 'YELLOW':
      return 'text-amber-700';
    case 'RED':
      return 'text-red-700';
    default:
      return 'text-gray-700';
  }
}

function getProgressBarColor(health: string): string {
  switch (health.toUpperCase()) {
    case 'GREEN':
      return 'bg-green-500';
    case 'YELLOW':
      return 'bg-amber-500';
    case 'RED':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProjectCard({ project, onClick }: ProjectCardProps) {
  const completedPercent =
    project.tasks && project.tasks.total > 0
      ? Math.round((project.tasks.completed / project.tasks.total) * 100)
      : 0;

  const displayedMilestones = project.milestones.slice(0, 4);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 hover:shadow-lg transition-shadow duration-200">
      {/* Top row: Entity pill + Health dot */}
      <div className="flex items-center justify-between">
        <span className="rounded-full px-2 py-0.5 text-xs bg-blue-50 text-blue-700">
          {project.entityName || project.entityId}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${getHealthColor(project.health)}`} />
          <span className={`text-xs font-medium ${getHealthTextColor(project.health)}`}>
            {getHealthLabel(project.health)}
          </span>
        </div>
      </div>

      {/* Name */}
      <h3
        className="mt-3 text-lg font-bold text-gray-900 cursor-pointer hover:text-blue-600 truncate"
        onClick={() => onClick?.(project.id)}
      >
        {project.name}
      </h3>

      {/* Description */}
      {project.description && (
        <p className="mt-1 text-sm text-gray-500 line-clamp-2">
          {project.description}
        </p>
      )}

      {/* Progress bar */}
      {project.tasks && project.tasks.total > 0 && (
        <div className="mt-3">
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className={`h-full rounded-full ${getProgressBarColor(project.health)}`}
              style={{ width: `${completedPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="mt-3 flex items-center text-xs text-gray-600">
        {project.tasks && (
          <span>
            Tasks: {project.tasks.completed}/{project.tasks.total} done
          </span>
        )}
        {project.targetDate && (
          <>
            <span className="mx-1.5">|</span>
            <span>Due: {formatDate(project.targetDate)}</span>
          </>
        )}
      </div>

      {/* Team row */}
      {(project.teamMembers !== undefined || project.blockedTasks !== undefined) && (
        <div className="mt-2 flex items-center text-xs text-gray-600">
          {project.teamMembers !== undefined && (
            <span>{'\u{1F464}'} {project.teamMembers} members</span>
          )}
          {project.blockedTasks !== undefined && (
            <>
              {project.teamMembers !== undefined && <span className="mx-1.5">|</span>}
              <span className={project.blockedTasks > 0 ? 'text-amber-600 font-medium' : ''}>
                {'\u26A0'} {project.blockedTasks} blocked
              </span>
            </>
          )}
        </div>
      )}

      {/* Milestones */}
      {displayedMilestones.length > 0 && (
        <div className="mt-3 space-y-1">
          {displayedMilestones.map((milestone) => (
            <div key={milestone.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span>{milestone.status === 'DONE' ? '\u2705' : '\u2B1C'}</span>
              <span className="truncate">{milestone.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <span className="text-xs text-gray-400">
          Updated {formatRelativeTime(project.updatedAt)}
        </span>
      </div>
    </div>
  );
}
