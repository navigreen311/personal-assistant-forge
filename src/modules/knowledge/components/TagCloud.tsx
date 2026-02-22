'use client';

interface TagCloudProps {
  tags: { tag: string; count: number }[];
  onTagClick?: (tag: string) => void;
  activeTag?: string | null;
}

const TAG_COLORS = [
  'text-blue-600 hover:text-blue-800',
  'text-green-600 hover:text-green-800',
  'text-purple-600 hover:text-purple-800',
  'text-amber-600 hover:text-amber-800',
  'text-pink-600 hover:text-pink-800',
  'text-teal-600 hover:text-teal-800',
  'text-indigo-600 hover:text-indigo-800',
  'text-rose-600 hover:text-rose-800',
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function TagCloud({ tags, onTagClick, activeTag }: TagCloudProps) {
  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400">
        <svg
          className="w-10 h-10 mb-2 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <p className="text-sm font-medium">No tags yet</p>
        <p className="text-xs mt-1">Tags will appear as you add entries</p>
      </div>
    );
  }

  const maxCount = Math.max(...tags.map((t) => t.count));

  function getSize(count: number): string {
    const ratio = count / maxCount;
    if (ratio > 0.8) return 'text-xl font-bold';
    if (ratio > 0.6) return 'text-lg font-semibold';
    if (ratio > 0.4) return 'text-base font-medium';
    if (ratio > 0.2) return 'text-sm';
    return 'text-xs';
  }

  return (
    <div className="flex flex-wrap gap-2 p-3">
      {tags.map(({ tag, count }) => {
        const isActive = activeTag === tag;
        return (
          <button
            key={tag}
            onClick={() => onTagClick?.(tag)}
            className={`${getSize(count)} ${
              isActive
                ? 'bg-blue-600 text-white px-2 py-0.5 rounded-full'
                : `${getTagColor(tag)} transition-colors`
            }`}
            title={`${count} ${count === 1 ? 'entry' : 'entries'}`}
          >
            {tag}
            <span className={`ml-1 text-xs ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
              ({count})
            </span>
          </button>
        );
      })}
    </div>
  );
}
