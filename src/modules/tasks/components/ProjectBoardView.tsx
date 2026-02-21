'use client';

interface ProjectBoardViewProps {
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    entityName?: string;
    health: string;
    status: string;
    tasks?: { total: number; completed: number };
    targetDate?: string;
    updatedAt: string;
  }>;
  onProjectClick: (id: string) => void;
}

type ColumnKey = 'active' | 'on_hold' | 'review' | 'done';

interface Column {
  key: ColumnKey;
  label: string;
  borderColor: string;
}

const COLUMNS: Column[] = [
  { key: 'active', label: 'Active', borderColor: 'border-t-blue-500' },
  { key: 'on_hold', label: 'On Hold', borderColor: 'border-t-amber-500' },
  { key: 'review', label: 'Review', borderColor: 'border-t-purple-500' },
  { key: 'done', label: 'Done', borderColor: 'border-t-green-500' },
];

const HEALTH_DOT_COLORS: Record<string, string> = {
  GREEN: 'bg-green-500',
  YELLOW: 'bg-yellow-500',
  RED: 'bg-red-500',
};

function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  return `${diffMonths}mo ago`;
}

function getColumnForProject(project: ProjectBoardViewProps['projects'][number]): ColumnKey {
  // Done column: DONE or CANCELLED status
  if (project.status === 'DONE' || project.status === 'CANCELLED') {
    return 'done';
  }

  // Review column: YELLOW health with active status (IN_PROGRESS or TODO)
  if (
    project.health === 'YELLOW' &&
    (project.status === 'IN_PROGRESS' || project.status === 'TODO')
  ) {
    return 'review';
  }

  // On Hold column: BLOCKED status
  if (project.status === 'BLOCKED') {
    return 'on_hold';
  }

  // Active column: IN_PROGRESS or TODO status
  if (project.status === 'IN_PROGRESS' || project.status === 'TODO') {
    return 'active';
  }

  // Default fallback to active
  return 'active';
}

function formatTargetDate(dateString?: string): string {
  if (!dateString) return 'No due date';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProjectBoardView({ projects, onProjectClick }: ProjectBoardViewProps) {
  const projectsByColumn = (columnKey: ColumnKey) =>
    projects.filter((p) => getColumnForProject(p) === columnKey);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const columnProjects = projectsByColumn(col.key);

        return (
          <div key={col.key} className="flex flex-col min-w-[280px] flex-shrink-0">
            {/* Column header */}
            <div
              className={`flex items-center justify-between px-3 py-2 bg-gray-50 border-t-4 ${col.borderColor} rounded-t-lg`}
            >
              <span className="text-sm font-semibold text-gray-700">{col.label}</span>
              <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">
                {columnProjects.length}
              </span>
            </div>

            {/* Column body */}
            <div className="flex-1 bg-gray-50 rounded-b-lg p-3">
              {columnProjects.map((project) => {
                const taskProgress =
                  project.tasks && project.tasks.total > 0
                    ? (project.tasks.completed / project.tasks.total) * 100
                    : 0;

                return (
                  <div
                    key={project.id}
                    className="bg-white rounded-lg p-3 mb-2 shadow-sm border border-gray-100"
                  >
                    {/* Entity pill */}
                    {project.entityName && (
                      <span className="inline-block text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 mb-2">
                        {project.entityName}
                      </span>
                    )}

                    {/* Project name */}
                    <p
                      className="font-medium text-sm text-gray-800 mb-2 cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => onProjectClick(project.id)}
                    >
                      {project.name}
                    </p>

                    {/* Health dot + mini progress bar */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_DOT_COLORS[project.health] || 'bg-gray-400'}`}
                      />
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${taskProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Task count */}
                    <p className="text-xs text-gray-500 mb-1">
                      {project.tasks
                        ? `${project.tasks.completed}/${project.tasks.total} tasks`
                        : '0/0 tasks'}
                    </p>

                    {/* Due date */}
                    <p className="text-xs text-gray-500 mb-2">
                      {formatTargetDate(project.targetDate)}
                    </p>

                    {/* Footer: updated time */}
                    <p className="text-xs text-gray-400">
                      Updated {getRelativeTime(project.updatedAt)}
                    </p>
                  </div>
                );
              })}

              {columnProjects.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">No projects</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
