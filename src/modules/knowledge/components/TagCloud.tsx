'use client';

interface TagCloudProps {
  tags: { tag: string; count: number }[];
  onTagClick?: (tag: string) => void;
}

export default function TagCloud({ tags, onTagClick }: TagCloudProps) {
  if (tags.length === 0) {
    return <p className="text-sm text-gray-500">No tags yet</p>;
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
      {tags.map(({ tag, count }) => (
        <button
          key={tag}
          onClick={() => onTagClick?.(tag)}
          className={`${getSize(count)} text-blue-600 hover:text-blue-800 transition-colors`}
          title={`${count} entries`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
