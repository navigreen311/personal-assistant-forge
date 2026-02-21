'use client';

import { useState, useRef } from 'react';
import type { Priority } from '@/shared/types';

interface EnhancedTaskCreateModalProps {
  entityId: string;
  onParse: (text: string) => Promise<Record<string, unknown>>;
  onCreate: (params: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

const EFFORT_OPTIONS = [
  { value: 'quick', label: 'Quick <15m' },
  { value: 'small', label: 'Small 15-30m' },
  { value: 'medium', label: 'Medium 1-2h' },
  { value: 'large', label: 'Large half day' },
  { value: 'xl', label: 'XL full day+' },
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

const PRIORITY_OPTIONS: { value: Priority; label: string; active: string; inactive: string }[] = [
  {
    value: 'P0',
    label: 'P0',
    active: 'bg-red-600 text-white border-red-600',
    inactive: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  },
  {
    value: 'P1',
    label: 'P1',
    active: 'bg-amber-500 text-white border-amber-500',
    inactive: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  },
  {
    value: 'P2',
    label: 'P2',
    active: 'bg-blue-600 text-white border-blue-600',
    inactive: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  },
];

export default function EnhancedTaskCreateModal({
  entityId,
  onParse,
  onCreate,
  onClose,
}: EnhancedTaskCreateModalProps) {
  // NLP
  const [nlpInput, setNlpInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // Core fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [entity, setEntity] = useState(entityId);
  const [project, setProject] = useState('');
  const [assignee, setAssignee] = useState('me');
  const [priority, setPriority] = useState<Priority>('P1');
  const [dueDate, setDueDate] = useState('');

  // Extended fields
  const [effort, setEffort] = useState('');
  const [recurrence, setRecurrence] = useState('none');

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Dependencies
  const [blockedBy, setBlockedBy] = useState('');
  const [blocks, setBlocks] = useState('');

  // Subtasks
  const [subtaskInputs, setSubtaskInputs] = useState<string[]>([]);

  // Drag-and-drop
  const [isDragOver, setIsDragOver] = useState(false);

  // Form state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dropZoneRef = useRef<HTMLDivElement>(null);

  // ---- NLP parse ----
  const handleNlpParse = async () => {
    if (!nlpInput.trim()) return;
    setIsParsing(true);
    try {
      const result = await onParse(nlpInput);
      if (result?.title) setTitle(result.title);
      if (result?.priority) setPriority(result.priority);
      if (result?.dueDate) setDueDate(new Date(result.dueDate).toISOString().split('T')[0]);
      if (result?.tags) setTags(result.tags);
      if (result?.assigneeName) setAssignee(result.assigneeName);
    } catch {
      // Silently fail — user can fill in fields manually
    } finally {
      setIsParsing(false);
    }
  };

  // ---- Tags ----
  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  // ---- Subtasks ----
  const addSubtaskInput = () => {
    setSubtaskInputs([...subtaskInputs, '']);
  };

  const updateSubtaskInput = (index: number, value: string) => {
    const updated = [...subtaskInputs];
    updated[index] = value;
    setSubtaskInputs(updated);
  };

  const removeSubtaskInput = (index: number) => {
    setSubtaskInputs(subtaskInputs.filter((_, i) => i !== index));
  };

  // ---- Drag & drop (visual only) ----
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // No upload logic — visual only
  };

  // ---- Submit ----
  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        entityId: entity || entityId,
        projectId: project || undefined,
        assigneeId: assignee === 'me' ? undefined : assignee,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        effort: effort || undefined,
        recurrence: recurrence !== 'none' ? recurrence : undefined,
        tags: tags.length > 0 ? tags : undefined,
        blockedBy: blockedBy.trim() || undefined,
        blocks: blocks.trim() || undefined,
        subtasks: subtaskInputs.filter((s) => s.trim()).map((s) => s.trim()),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Modal card */}
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Create Task</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ---- NLP Quick Create ---- */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Quick create — type naturally
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nlpInput}
                onChange={(e) => setNlpInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNlpParse()}
                placeholder='e.g. "Review Q4 financials for MedLink by Friday P0"'
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
              />
              <button
                onClick={handleNlpParse}
                disabled={isParsing || !nlpInput.trim()}
                className="px-3 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {isParsing ? '...' : 'Parse'}
              </button>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* ---- Title ---- */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* ---- Description ---- */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional details..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* ---- Entity & Project ---- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Entity</label>
              <select
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value={entityId}>{entityId}</option>
                <option value="">No entity</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Project</label>
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No project</option>
                <option value="project-1">Project Alpha</option>
                <option value="project-2">Project Beta</option>
              </select>
            </div>
          </div>

          {/* ---- Assignee & Due Date ---- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assignee</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="me">Me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* ---- Priority ---- */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Priority</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPriority(opt.value)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                    priority === opt.value ? opt.active : opt.inactive
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ---- Effort & Recurrence ---- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Estimated Effort
              </label>
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select effort...</option>
                {EFFORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Recurrence</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ---- Tags ---- */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Tags</label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
                  >
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-gray-400 hover:text-red-500 leading-none"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag, press Enter..."
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addTag}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                Add
              </button>
            </div>
          </div>

          {/* ---- Dependencies ---- */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Dependencies</label>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Blocked by:</label>
                <input
                  type="text"
                  value={blockedBy}
                  onChange={(e) => setBlockedBy(e.target.value)}
                  placeholder="Search tasks that block this one..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Blocks:</label>
                <input
                  type="text"
                  value={blocks}
                  onChange={(e) => setBlocks(e.target.value)}
                  placeholder="Search tasks this one blocks..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>

          {/* ---- Subtasks ---- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700">Subtasks</label>
              <button
                onClick={addSubtaskInput}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                + Add subtask
              </button>
            </div>
            {subtaskInputs.length > 0 && (
              <div className="space-y-2">
                {subtaskInputs.map((val, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <span className="text-gray-300 text-xs">&#9633;</span>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => updateSubtaskInput(index, e.target.value)}
                      placeholder={`Subtask ${index + 1}`}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      autoFocus={index === subtaskInputs.length - 1}
                    />
                    <button
                      onClick={() => removeSubtaskInput(index)}
                      className="text-gray-400 hover:text-red-500 text-base leading-none"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
            {subtaskInputs.length === 0 && (
              <p className="text-xs text-gray-400 italic">No subtasks added yet.</p>
            )}
          </div>

          {/* ---- Attachments ---- */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Attachments</label>
            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-lg transition-colors cursor-default ${
                isDragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <span className="text-2xl select-none">&#128206;</span>
              <p className="text-xs text-gray-500 text-center">
                Drag & drop files here, or{' '}
                <span className="text-blue-600 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-400">Any file type accepted</p>
            </div>
          </div>

          {/* ---- Error ---- */}
          {error && (
            <p className="text-xs text-red-600 font-medium">{error}</p>
          )}
        </div>

        {/* Footer / Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
