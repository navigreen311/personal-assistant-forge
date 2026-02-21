'use client';

interface DashboardHeaderProps {
  userName: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  timeSavedThisWeek: number;
}

export default function DashboardHeader({ userName, timeOfDay, timeSavedThisWeek }: DashboardHeaderProps) {
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-4 flex justify-between items-center">
      {/* Left side: greeting + date */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">
          Good {timeOfDay}, {userName}
        </h1>
        <p className="text-sm text-gray-500">{formattedDate}</p>
      </div>

      {/* Right side: time saved counter */}
      <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">
        {/* Clock icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>~{timeSavedThisWeek} hrs saved this week</span>
      </div>
    </div>
  );
}
