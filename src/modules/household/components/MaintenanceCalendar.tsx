'use client';

import type { MaintenanceTask } from '../types';

const categoryColors: Record<string, string> = {
  HVAC: 'bg-blue-200 text-blue-800',
  PLUMBING: 'bg-cyan-200 text-cyan-800',
  ELECTRICAL: 'bg-yellow-200 text-yellow-800',
  LAWN: 'bg-green-200 text-green-800',
  APPLIANCE: 'bg-purple-200 text-purple-800',
  ROOF: 'bg-orange-200 text-orange-800',
  PEST: 'bg-red-200 text-red-800',
  GENERAL: 'bg-gray-200 text-gray-800',
};

export default function MaintenanceCalendar({ tasks }: { tasks: MaintenanceTask[] }) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const tasksByDay = new Map<number, MaintenanceTask[]>();
  for (const task of tasks) {
    const dueDate = new Date(task.nextDueDate);
    if (dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear) {
      const day = dueDate.getDate();
      const existing = tasksByDay.get(day) ?? [];
      existing.push(task);
      tasksByDay.set(day, existing);
    }
  }

  const days = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDayOfWeek + 1;
    return dayNum > 0 && dayNum <= daysInMonth ? dayNum : null;
  });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">
        Maintenance Calendar - {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </h3>
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map(d => (
          <div key={d} className="text-xs font-medium text-gray-500 text-center py-1">{d}</div>
        ))}
        {days.map((day, idx) => (
          <div
            key={idx}
            className={`min-h-[60px] border rounded p-1 ${day === now.getDate() ? 'border-blue-500 bg-blue-50' : 'border-gray-100'} ${!day ? 'bg-gray-50' : ''}`}
          >
            {day && (
              <>
                <div className="text-xs text-gray-600">{day}</div>
                {(tasksByDay.get(day) ?? []).map(task => (
                  <div
                    key={task.id}
                    className={`text-[10px] px-1 rounded mt-0.5 truncate ${categoryColors[task.category] ?? 'bg-gray-100'}`}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
