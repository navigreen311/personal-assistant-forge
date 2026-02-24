'use client';

import { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DelegateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDelegated?: () => void;
}

interface TaskOption {
  id: string;
  title: string;
}

interface ContactOption {
  id: string;
  name: string;
  type: 'contact' | 'ai_agent';
}

interface EntityOption {
  id: string;
  name: string;
}

type Priority = 'P0' | 'P1' | 'P2';

interface FormErrors {
  task?: string;
  assignTo?: string;
  entityId?: string;
}

const PRIORITIES: { key: Priority; label: string; activeBg: string; activeText: string }[] = [
  { key: 'P0', label: 'P0 - Critical', activeBg: '#fee2e2', activeText: '#991b1b' },
  { key: 'P1', label: 'P1 - High', activeBg: '#fef3c7', activeText: '#92400e' },
  { key: 'P2', label: 'P2 - Normal', activeBg: '#dbeafe', activeText: '#1e40af' },
];

const AI_AGENTS: ContactOption[] = [
  { id: 'ai-general', name: 'AI Agent - General Assistant', type: 'ai_agent' },
  { id: 'ai-research', name: 'AI Agent - Research', type: 'ai_agent' },
  { id: 'ai-writing', name: 'AI Agent - Writing', type: 'ai_agent' },
];

export default function DelegateTaskModal({
  isOpen,
  onClose,
  onDelegated,
}: DelegateTaskModalProps) {
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskOption | null>(null);
  const [isCreatingNewTask, setIsCreatingNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [taskResults, setTaskResults] = useState<TaskOption[]>([]);
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState<ContactOption | null>(null);
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [entityId, setEntityId] = useState('');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [priority, setPriority] = useState<Priority>('P2');
  const [dueDate, setDueDate] = useState('');
  const [context, setContext] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [approvalRequired, setApprovalRequired] = useState('yes');
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [notifyIfBlocked, setNotifyIfBlocked] = useState(true);
  const [dailyDigest, setDailyDigest] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const taskSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assignSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskDropdownRef = useRef<HTMLDivElement>(null);
  const assignDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingEntities(true);
    fetch('/api/entities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setEntities(json.data.map((e: any) => ({ id: e.id, name: e.name })));
        } else if (Array.isArray(json)) {
          setEntities(json.map((e: any) => ({ id: e.id, name: e.name })));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEntities(false));
  }, [isOpen]);

  useEffect(() => {
    if (!taskSearch.trim() || selectedTask) {
      setTaskResults([]);
      setShowTaskDropdown(false);
      return;
    }
    if (taskSearchTimer.current) clearTimeout(taskSearchTimer.current);
    taskSearchTimer.current = setTimeout(() => {
      setLoadingTasks(true);
      fetch(`/api/tasks?search=${encodeURIComponent(taskSearch.trim())}`)
        .then((res) => res.json())
        .then((json) => {
          const data = json.success && Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
          setTaskResults(data.map((t: any) => ({ id: t.id, title: t.title || t.name })));
          setShowTaskDropdown(true);
        })
        .catch(() => { setTaskResults([]); setShowTaskDropdown(true); })
        .finally(() => setLoadingTasks(false));
    }, 300);
    return () => { if (taskSearchTimer.current) clearTimeout(taskSearchTimer.current); };
  }, [taskSearch, selectedTask]);

  useEffect(() => {
    if (!assignSearch.trim() || selectedAssignee) {
      setContactResults([]);
      setShowAssignDropdown(false);
      return;
    }
    if (assignSearchTimer.current) clearTimeout(assignSearchTimer.current);
    assignSearchTimer.current = setTimeout(() => {
      setLoadingContacts(true);
      fetch(`/api/contacts?search=${encodeURIComponent(assignSearch.trim())}`)
        .then((res) => res.json())
        .then((json) => {
          const data = json.success && Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
          const contacts: ContactOption[] = data.map((c: any) => ({
            id: c.id,
            name: c.name || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
            type: 'contact' as const,
          }));
          const matchingAgents = AI_AGENTS.filter((a) =>
            a.name.toLowerCase().includes(assignSearch.toLowerCase()),
          );
          setContactResults([...matchingAgents, ...contacts]);
          setShowAssignDropdown(true);
        })
        .catch(() => {
          const matchingAgents = AI_AGENTS.filter((a) =>
            a.name.toLowerCase().includes(assignSearch.toLowerCase()),
          );
          setContactResults(matchingAgents);
          setShowAssignDropdown(true);
        })
        .finally(() => setLoadingContacts(false));
    }, 300);
    return () => { if (assignSearchTimer.current) clearTimeout(assignSearchTimer.current); };
  }, [assignSearch, selectedAssignee]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (taskDropdownRef.current && !taskDropdownRef.current.contains(e.target as Node)) setShowTaskDropdown(false);
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) setShowAssignDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!selectedTask && !isCreatingNewTask) newErrors.task = 'Task is required.';
    if (isCreatingNewTask && !newTaskTitle.trim()) newErrors.task = 'Task title is required.';
    if (!selectedAssignee) newErrors.assignTo = 'Assignee is required.';
    if (!entityId) newErrors.entityId = 'Entity is required.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const body: Record<string, any> = {
        taskId: selectedTask?.id ?? undefined,
        newTaskTitle: isCreatingNewTask ? newTaskTitle.trim() : undefined,
        delegatedTo: selectedAssignee!.id,
        entityId,
        priority,
        dueDate: dueDate || undefined,
        context: context.trim() || undefined,
        approvalRequired: approvalRequired === 'yes',
        notifications: { onComplete: notifyOnComplete, ifBlocked: notifyIfBlocked, dailyDigest },
      };
      const res = await fetch('/api/delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `Request failed with status ${res.status}`);
      }
      onDelegated?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to delegate task');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setTaskSearch(''); setSelectedTask(null); setIsCreatingNewTask(false);
      setNewTaskTitle(''); setTaskResults([]); setShowTaskDropdown(false);
      setAssignSearch(''); setSelectedAssignee(null); setContactResults([]);
      setShowAssignDropdown(false); setEntityId(''); setPriority('P2');
      setDueDate(''); setContext(''); setAttachments([]);
      setApprovalRequired('yes'); setNotifyOnComplete(true);
      setNotifyIfBlocked(true); setDailyDigest(false); setErrors({}); setSubmitError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const inputClass = (hasError?: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
      hasError ? 'border-red-400' : 'border-gray-300'
    }`;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto relative">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-gray-900 mb-1">Delegate Task</h2>
        <p className="text-sm text-gray-500 mb-5">Assign a task to a team member or AI agent.</p>

        {submitError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{submitError}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task search */}
          <div ref={taskDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task <span className="text-red-500">*</span></label>
            {selectedTask ? (
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50">
                <span className="flex-1 truncate">{selectedTask.title}</span>
                <button type="button" onClick={() => { setSelectedTask(null); setTaskSearch(''); setIsCreatingNewTask(false); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : isCreatingNewTask ? (
              <div className="space-y-2">
                <input type="text" value={newTaskTitle} onChange={(e) => { setNewTaskTitle(e.target.value); if (errors.task) setErrors({ ...errors, task: undefined }); }} placeholder="Enter new task title..." className={inputClass(errors.task)} autoFocus />
                <button type="button" onClick={() => { setIsCreatingNewTask(false); setNewTaskTitle(''); }} className="text-xs text-blue-600 hover:text-blue-800">Search existing tasks instead</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={taskSearch} onChange={(e) => { setTaskSearch(e.target.value); if (errors.task) setErrors({ ...errors, task: undefined }); }} placeholder="Search tasks..." className={inputClass(errors.task)} />
                {loadingTasks && (<div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" /></div>)}
                {showTaskDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {taskResults.map((task) => (
                      <button key={task.id} type="button" onClick={() => { setSelectedTask(task); setTaskSearch(''); setShowTaskDropdown(false); if (errors.task) setErrors({ ...errors, task: undefined }); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors">{task.title}</button>
                    ))}
                    <button type="button" onClick={() => { setIsCreatingNewTask(true); setTaskSearch(''); setShowTaskDropdown(false); if (errors.task) setErrors({ ...errors, task: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100 font-medium transition-colors">+ Create new task</button>
                  </div>
                )}
              </div>
            )}
            {errors.task && (<p className="mt-1 text-xs text-red-600">{errors.task}</p>)}
          </div>

          {/* Assign to search */}
          <div ref={assignDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to <span className="text-red-500">*</span></label>
            {selectedAssignee ? (
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50">
                {selectedAssignee.type === 'ai_agent' && (<span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium shrink-0">AI</span>)}
                <span className="flex-1 truncate">{selectedAssignee.name}</span>
                <button type="button" onClick={() => { setSelectedAssignee(null); setAssignSearch(''); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={assignSearch} onChange={(e) => { setAssignSearch(e.target.value); if (errors.assignTo) setErrors({ ...errors, assignTo: undefined }); }} placeholder="Search team members or AI agents..." className={inputClass(errors.assignTo)} />
                {loadingContacts && (<div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" /></div>)}
                {showAssignDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {contactResults.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No results found.</div>
                    ) : (
                      contactResults.map((contact) => (
                        <button key={contact.id} type="button" onClick={() => { setSelectedAssignee(contact); setAssignSearch(''); setShowAssignDropdown(false); if (errors.assignTo) setErrors({ ...errors, assignTo: undefined }); }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 transition-colors">
                          {contact.type === 'ai_agent' && (<span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">AI</span>)}
                          <span>{contact.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {errors.assignTo && (<p className="mt-1 text-xs text-red-600">{errors.assignTo}</p>)}
          </div>

          {/* Entity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entity <span className="text-red-500">*</span></label>
            <select value={entityId} onChange={(e) => { setEntityId(e.target.value); if (errors.entityId) setErrors({ ...errors, entityId: undefined }); }} className={inputClass(errors.entityId)}>
              <option value="">{loadingEntities ? 'Loading entities...' : 'Select an entity'}</option>
              {entities.map((entity) => (<option key={entity.id} value={entity.id}>{entity.name}</option>))}
            </select>
            {errors.entityId && (<p className="mt-1 text-xs text-red-600">{errors.entityId}</p>)}
          </div>

          {/* Priority pill selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => {
                const isActive = priority === p.key;
                return (
                  <button key={p.key} type="button" onClick={() => setPriority(p.key)} className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${isActive ? 'border-transparent' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`} style={isActive ? { backgroundColor: p.activeBg, color: p.activeText } : undefined}>
                    {p.key}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass()} />
          </div>

          {/* Context for delegate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Context for delegate</label>
            <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={4} placeholder="Instructions, links, requirements, or any context the delegate needs..." className={inputClass() + ' resize-none'} />
          </div>

          {/* Attachments (placeholder UI) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                Attach files
                <input type="file" multiple onChange={(e) => { if (e.target.files) setAttachments(Array.from(e.target.files)); }} className="hidden" />
              </label>
              {attachments.length > 0 && (<span className="text-xs text-gray-500">{attachments.length} file{attachments.length !== 1 ? 's' : ''} selected</span>)}
            </div>
          </div>

          {/* Approval required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Approval required when complete</label>
            <select value={approvalRequired} onChange={(e) => setApprovalRequired(e.target.value)} className={inputClass()}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          {/* Notification preferences */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notification preferences</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={notifyOnComplete} onChange={(e) => setNotifyOnComplete(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Notify on complete
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={notifyIfBlocked} onChange={(e) => setNotifyIfBlocked(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Notify if blocked
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={dailyDigest} onChange={(e) => setDailyDigest(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Daily digest
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {isSubmitting ? 'Delegating...' : 'Delegate Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
