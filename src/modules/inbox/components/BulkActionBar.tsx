'use client';

interface BulkActionBarProps {
  selectedCount: number;
  onArchive: () => void;
  onMarkProcessed: () => void;
  onDelegate: () => void;
  onSnooze: () => void;
  onDeselectAll: () => void;
}

export function BulkActionBar({
  selectedCount,
  onArchive,
  onMarkProcessed,
  onDelegate,
  onSnooze,
  onDeselectAll,
}: BulkActionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-2 flex items-center gap-3 transition-all">
      <span className="text-sm font-medium text-gray-700">
        {selectedCount} selected
      </span>

      <div className="w-px h-5 bg-gray-300" />

      <button
        onClick={onArchive}
        className="text-sm px-3 py-1.5 rounded-md border border-gray-200 transition-colors hover:bg-green-50 hover:text-green-700 hover:border-green-200"
      >
        Archive
      </button>

      <button
        onClick={onMarkProcessed}
        className="text-sm px-3 py-1.5 rounded-md border border-gray-200 transition-colors hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
      >
        Mark Processed
      </button>

      <button
        onClick={onDelegate}
        className="text-sm px-3 py-1.5 rounded-md border border-gray-200 transition-colors hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
      >
        Delegate
      </button>

      <button
        onClick={onSnooze}
        className="text-sm px-3 py-1.5 rounded-md border border-gray-200 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        Snooze
      </button>

      <button
        onClick={onDeselectAll}
        className="ml-auto text-sm text-gray-500 hover:text-gray-700 cursor-pointer underline"
      >
        Deselect All
      </button>
    </div>
  );
}
