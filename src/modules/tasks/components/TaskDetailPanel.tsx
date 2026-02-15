'use client';

import { useState } from 'react';
import type { Task, TaskStatus, Priority } from '@/shared/types';
import type { TaskContext } from '../types';

interface TaskDetailPanelProps {
  task: Task;
  context?: TaskContext;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  onClose?: () => void;
  isSlideOut?: boolean;
}

const STATUS_OPTIONS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2'];

export default function TaskDetailPanel({
  task,
  context,
  onUpdate,
  onDelete,
  onClose,
  isSlideOut = true,
}: TaskDetailPanelProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [tagInput, setTagInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleTitleBlur = () => {
    if (title !== task.title) onUpdate({ title });
  };

  const handleDescriptionBlur = () => {
    if (description !== (task.description ?? '')) onUpdate({ description });
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !task.tags.includes(tag)) {
      onUpdate({ tags: [...task.tags, tag] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    onUpdate({ tags: task.tags.filter((t) => t !== tag) });
  };

  const removeDependency = (depId: string) => {
    onUpdate({ dependencies: task.dependencies.filter((d) => d !== depId) });
  };

  const containerClass = isSlideOut
    ? 'fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl border-l border-gray-200 overflow-y-auto z-50'
    : 'bg-white rounded-lg border border-gray-200 overflow-y-auto';

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 truncate">Task Details</h2>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        )}
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          />
        </div>

        {/* Priority & Status */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
            <select
              value={task.priority}
              onChange={(e) => onUpdate({ priority: e.target.value as Priority })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={task.status}
              onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Due Date */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
          <input
            type="date"
            value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
            onChange={(e) => onUpdate({ dueDate: e.target.value ? new Date(e.target.value) : undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tags</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {task.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                {tag}
                <button onClick={() => removeTag(tag)} className="text-gray-400 hover:text-red-500">&times;</button>
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
            <button onClick={addTag} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">
              Add
            </button>
          </div>
        </div>

        {/* Dependencies */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Dependencies ({task.dependencies.length})
          </label>
          {task.dependencies.length > 0 ? (
            <div className="space-y-1">
              {task.dependencies.map((depId) => (
                <div key={depId} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded text-xs">
                  <span className="text-gray-600 truncate">{depId}</span>
                  <button onClick={() => removeDependency(depId)} className="text-red-400 hover:text-red-600">&times;</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No dependencies</p>
          )}
        </div>

        {/* Context Section */}
        {context && (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Context</h3>

            {context.relatedDocuments.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Related Documents</p>
                {context.relatedDocuments.map((doc) => (
                  <div key={doc.id} className="text-xs text-blue-600 hover:underline cursor-pointer mb-0.5">
                    {doc.title} ({doc.type})
                  </div>
                ))}
              </div>
            )}

            {context.relatedMessages.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Related Messages</p>
                {context.relatedMessages.map((msg) => (
                  <div key={msg.id} className="text-xs text-gray-600 mb-1 p-2 bg-gray-50 rounded">
                    <span className="font-medium">{msg.channel}</span>: {msg.preview.slice(0, 100)}...
                  </div>
                ))}
              </div>
            )}

            {context.relatedContacts.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Related Contacts</p>
                <div className="flex flex-wrap gap-1">
                  {context.relatedContacts.map((c) => (
                    <span key={c.id} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-full">
                      {c.name}{c.role ? ` (${c.role})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity log */}
        {context?.previousActivity && context.previousActivity.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Activity</h3>
            <div className="space-y-2">
              {context.previousActivity.slice(0, 5).map((activity, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                  <div>
                    <span className="text-gray-600">{activity.action}</span>
                    <span className="text-gray-400 ml-2">
                      {new Date(activity.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delete */}
        <div className="border-t border-gray-200 pt-4">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Cancel this task?</span>
              <button
                onClick={() => { onDelete(task.id); setShowDeleteConfirm(false); }}
                className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Archive / Cancel Task
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
