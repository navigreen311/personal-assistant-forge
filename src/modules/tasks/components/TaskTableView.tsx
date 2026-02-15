'use client';

import { useState, useCallback } from 'react';
import type { Task, TaskStatus, Priority } from '@/shared/types';
import type { TaskSortOptions } from '../types';

interface TaskTableViewProps {
  tasks: Task[];
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
  onSort: (sort: TaskSortOptions) => void;
  currentSort?: TaskSortOptions;
}

const STATUS_OPTIONS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2'];

type SortField = TaskSortOptions['field'];

export default function TaskTableView({
  tasks,
  onTaskUpdate,
  onSort,
  currentSort,
}: TaskTableViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleSort = (field: SortField) => {
    const direction =
      currentSort?.field === field && currentSort.direction === 'asc' ? 'desc' : 'asc';
    onSort({ field, direction });
  };

  const sortIndicator = (field: SortField) => {
    if (currentSort?.field !== field) return '';
    return currentSort.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const startEdit = (taskId: string, field: string, value: string) => {
    setEditingCell({ taskId, field });
    setEditValue(value);
  };

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { taskId, field } = editingCell;
    if (field === 'title') {
      onTaskUpdate(taskId, { title: editValue });
    }
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, onTaskUpdate]);

  const toggleSelect = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const exportCsv = () => {
    const headers = ['Title', 'Priority', 'Status', 'Due Date', 'Tags', 'Created'];
    const rows = tasks.map((t) => [
      t.title,
      t.priority,
      t.status,
      t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : '',
      t.tags.join('; '),
      new Date(t.createdAt).toISOString().split('T')[0],
    ]);

    const csv = [headers, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tasks.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (date?: Date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={exportCsv}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.size === tasks.length && tasks.length > 0}
                  onChange={() =>
                    setSelectedIds(selectedIds.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id)))
                  }
                  className="rounded border-gray-300"
                />
              </th>
              {([
                { field: 'title' as SortField, label: 'Title' },
                { field: 'priority' as SortField, label: 'Priority' },
                { field: 'status' as SortField, label: 'Status' },
                { field: 'dueDate' as SortField, label: 'Due Date' },
                { field: 'createdAt' as SortField, label: 'Created' },
                { field: 'updatedAt' as SortField, label: 'Updated' },
              ]).map((col) => (
                <th
                  key={col.field}
                  onClick={() => handleSort(col.field)}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                >
                  {col.label}{sortIndicator(col.field)}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tags
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(task.id)}
                    onChange={() => toggleSelect(task.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-3 py-2">
                  {editingCell?.taskId === task.id && editingCell?.field === 'title' ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                      className="w-full px-1 py-0.5 border border-blue-300 rounded text-sm"
                      autoFocus
                    />
                  ) : (
                    <button
                      onDoubleClick={() => startEdit(task.id, 'title', task.title)}
                      className="text-left font-medium text-gray-900 hover:text-blue-600 truncate block max-w-xs"
                    >
                      {task.title}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={task.priority}
                    onChange={(e) => onTaskUpdate(task.id, { priority: e.target.value as Priority })}
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={task.status}
                    onChange={(e) => onTaskUpdate(task.id, { status: e.target.value as TaskStatus })}
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {formatDate(task.dueDate)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {formatDate(task.createdAt)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {formatDate(task.updatedAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {task.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tasks.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">No tasks to display</div>
        )}
      </div>
    </div>
  );
}
