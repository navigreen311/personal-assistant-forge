'use client';

import { useState } from 'react';
import type { Priority, TaskStatus } from '@/shared/types';
import type { ParsedTaskInput } from '../types';

interface TaskCreateFormProps {
  onParse: (text: string) => Promise<ParsedTaskInput>;
  onCreate: (params: {
    title: string;
    entityId: string;
    description?: string;
    priority?: Priority;
    dueDate?: Date;
    projectId?: string;
    tags?: string[];
  }) => Promise<void>;
  entityId: string;
  onClose?: () => void;
}

export default function TaskCreateForm({
  onParse,
  onCreate,
  entityId,
  onClose,
}: TaskCreateFormProps) {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedTaskInput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual overrides
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('P1');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const handleInputChange = async (value: string) => {
    setInput(value);
    setError(null);

    if (value.trim().length < 3) {
      setParsed(null);
      return;
    }

    try {
      const result = await onParse(value);
      setParsed(result);
      setTitle(result.title);
      if (result.priority) setPriority(result.priority);
      if (result.dueDate) setDueDate(new Date(result.dueDate).toISOString().split('T')[0]);
      if (result.tags) setTags(result.tags);
    } catch {
      // Silently fail parsing - user can still use manual fields
    }
  };

  const handleCreate = async (createAnother: boolean) => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onCreate({
        title: title.trim(),
        entityId,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (createAnother) {
        setInput('');
        setParsed(null);
        setTitle('');
        setPriority('P1');
        setDueDate('');
        setTags([]);
      } else {
        onClose?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const confidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-green-600';
    if (confidence >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Create Task</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        )}
      </div>

      {/* NLP Input */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Quick create (type naturally)
        </label>
        <textarea
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder='e.g., "Review Q4 financials for EHR project by Friday P0"'
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Parsed preview */}
      {parsed && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-blue-700">Parsed Results</span>
            <span className={`text-xs font-medium ${confidenceColor(parsed.confidence)}`}>
              {Math.round(parsed.confidence * 100)}% confidence
            </span>
          </div>
          <div className="space-y-1 text-xs text-blue-800">
            {parsed.title && <div>Title: <span className="font-medium">{parsed.title}</span></div>}
            {parsed.priority && <div>Priority: <span className="font-medium">{parsed.priority}</span></div>}
            {parsed.dueDate && (
              <div>Due: <span className="font-medium">{new Date(parsed.dueDate).toLocaleDateString()}</span></div>
            )}
            {parsed.projectName && <div>Project: <span className="font-medium">{parsed.projectName}</span></div>}
            {parsed.assigneeName && <div>Assignee: <span className="font-medium">{parsed.assigneeName}</span></div>}
            {parsed.tags && parsed.tags.length > 0 && (
              <div>Tags: {parsed.tags.map((t) => (
                <span key={t} className="inline-block px-1.5 py-0.5 bg-blue-100 rounded mr-1">{t}</span>
              ))}</div>
            )}
          </div>
        </div>
      )}

      {/* Manual fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder="Task title"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="P0">P0 — Critical</option>
              <option value="P1">P1 — Normal</option>
              <option value="P2">P2 — Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tags</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                {tag}
                <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="text-gray-400 hover:text-red-500">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
              placeholder="Add tag..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-xs"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-6">
        <button
          onClick={() => handleCreate(false)}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Creating...' : 'Create'}
        </button>
        <button
          onClick={() => handleCreate(true)}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50"
        >
          Create & Add Another
        </button>
      </div>
    </div>
  );
}
