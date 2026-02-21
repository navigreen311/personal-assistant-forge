'use client';

interface ProjectListViewProps {
  projects: Array<{
    id: string;
    name: string;
    entityName?: string;
    health: string;
    status: string;
    tasks?: { total: number; completed: number };
    targetDate?: string;
    updatedAt: string;
  }>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onProjectClick: (id: string) => void;
}

const HEALTH_COLORS: Record<string, string> = {
  ON_TRACK: 'bg-green-500',
  AT_RISK: 'bg-yellow-500',
  BEHIND: 'bg-red-500',
  COMPLETED: 'bg-blue-500',
  NOT_STARTED: 'bg-gray-400',
};

const HEALTH_LABELS: Record<string, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  BEHIND: 'Behind',
  COMPLETED: 'Completed',
  NOT_STARTED: 'Not Started',
};

type SortableField = 'name' | 'entityName' | 'health' | 'progress' | 'tasks' | 'targetDate' | 'updatedAt';

const COLUMNS: Array<{ field: SortableField; label: string }> = [
  { field: 'name', label: 'Project' },
  { field: 'entityName', label: 'Entity' },
  { field: 'health', label: 'Health' },
  { field: 'progress', label: 'Progress' },
  { field: 'tasks', label: 'Tasks' },
  { field: 'targetDate', label: 'Due Date' },
  { field: 'updatedAt', label: 'Updated' },
];

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getProgress(tasks?: { total: number; completed: number }): number {
  if (!tasks || tasks.total === 0) return 0;
  return Math.round((tasks.completed / tasks.total) * 100);
}

export default function ProjectListView({
  projects,
  sortBy,
  sortOrder,
  onSort,
  onProjectClick,
}: ProjectListViewProps) {
  const sortIndicator = (field: string) => {
    if (sortBy !== field) return null;
    return (
      <span className="ml-1 text-gray-400">
        {sortOrder === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm divide-y divide-gray-200">
        <thead>
          <tr className="bg-gray-50">
            {COLUMNS.map((col) => (
              <th
                key={col.field}
                onClick={() => onSort(col.field)}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
              >
                {col.label}
                {sortIndicator(col.field)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {projects.map((project) => {
            const progress = getProgress(project.tasks);
            const healthColor = HEALTH_COLORS[project.health] || 'bg-gray-400';
            const healthLabel = HEALTH_LABELS[project.health] || project.health;

            return (
              <tr
                key={project.id}
                onClick={() => onProjectClick(project.id)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {project.name}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {project.entityName || '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${healthColor}`}
                    />
                    <span className="text-xs text-gray-700">{healthLabel}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {project.tasks
                    ? `${project.tasks.completed}/${project.tasks.total}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {formatDate(project.targetDate)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {formatDate(project.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {projects.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No projects match your filters
        </div>
      )}
    </div>
  );
}
