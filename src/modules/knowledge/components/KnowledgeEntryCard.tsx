'use client';

import type { CapturedEntry, CaptureType } from '@/modules/knowledge/types';

interface KnowledgeEntryCardProps {
  entry: CapturedEntry;
  onClick?: (entry: CapturedEntry) => void;
  onEdit?: (entry: CapturedEntry) => void;
  onDelete?: (entryId: string) => void;
}

const TYPE_ICONS: Record<CaptureType, string> = {
  NOTE: '\uD83D\uDCDD',
  BOOKMARK: '\uD83D\uDD17',
  ARTICLE: '\uD83D\uDCCE',
  IMAGE_NOTE: '\uD83D\uDCCE',
  CODE_SNIPPET: '\uD83D\uDCAC',
  VOICE_MEMO: '\uD83C\uDFA4',
  QUOTE: '\uD83D\uDCCC',
};

const TYPE_COLORS: Record<CaptureType, string> = {
  NOTE: 'bg-blue-100 text-blue-700',
  BOOKMARK: 'bg-green-100 text-green-700',
  ARTICLE: 'bg-purple-100 text-purple-700',
  IMAGE_NOTE: 'bg-purple-100 text-purple-700',
  CODE_SNIPPET: 'bg-amber-100 text-amber-700',
  VOICE_MEMO: 'bg-pink-100 text-pink-700',
  QUOTE: 'bg-teal-100 text-teal-700',
};

const TAG_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-rose-100 text-rose-700',
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function KnowledgeEntryCard({ entry, onClick, onEdit, onDelete }: KnowledgeEntryCardProps) {
  const icon = TYPE_ICONS[entry.type] || '\uD83D\uDCC4';
  const typeColor = TYPE_COLORS[entry.type] || 'bg-gray-100 text-gray-700';
  const displayTitle = entry.title || entry.content.split('\n')[0].slice(0, 80);
  const strengthValue = (entry as CapturedEntry & { strength?: number }).strength;

  return (
    <div
      onClick={() => onClick?.(entry)}
      className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors group"
    >
      {/* Header: Type badge + date + actions */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium px-2 py-1 rounded ${typeColor}`}>
          {icon} {entry.type.replace('_', ' ')}
        </span>
        <div className="flex items-center gap-1">
          {(onEdit || onDelete) && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mr-2">
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(entry);
                  }}
                  className="text-xs px-2 py-0.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="Edit"
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(entry.id);
                  }}
                  className="text-xs px-2 py-0.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  Delete
                </button>
              )}
            </div>
          )}
          <span className="text-xs text-gray-500">
            {new Date(entry.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Title / content preview */}
      <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate">{displayTitle}</h3>
      {entry.title && (
        <p className="text-sm text-gray-600 line-clamp-2">{entry.content}</p>
      )}

      {/* Metadata row: source + access count */}
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        {entry.source && (
          <span>Source: {entry.source}</span>
        )}
      </div>

      {/* Strength bar */}
      {strengthValue !== undefined && strengthValue !== null && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-0.5">
            <span>Strength</span>
            <span>{Math.round(strengthValue * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.round(strengthValue * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Tag pills */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {entry.tags.slice(0, 5).map((tag) => (
            <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${getTagColor(tag)}`}>
              {tag}
            </span>
          ))}
          {entry.tags.length > 5 && (
            <span className="text-xs text-gray-400">+{entry.tags.length - 5}</span>
          )}
        </div>
      )}
    </div>
  );
}
