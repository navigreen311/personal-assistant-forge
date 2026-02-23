'use client';

import { useState, useEffect, useCallback } from 'react';
import RetentionInfoBar from './RetentionInfoBar';
import SessionAnalyticsChart from './SessionAnalyticsChart';

export interface SessionEntry {
  id: string;
  date: string;
  duration: string;
  durationSeconds: number;
  channel: string;
  messageCount: number;
  summary: string;
  messages?: Array<{ role: string; content: string; createdAt: string }>;
  actions?: string[];
  audioUrl?: string;
  entityName?: string;
  actionsCount?: number;
  outcomes?: Array<{ type: string; description: string }>;
}

export interface HistoryStats {
  totalSessions: number;
  voicePercent: number;
  actionsExecuted: number;
  timeSavedHours: number;
  approvalRate: number;
  sessionsTrend: number;
  actionsTrend: number;
  hourlyRate: number;
}

interface SettingsHistoryProps {
  userId?: string;
}

export default function SettingsHistory({ userId }: SettingsHistoryProps) {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [stats, setStats] = useState<HistoryStats>({
    totalSessions: 0,
    voicePercent: 0,
    actionsExecuted: 0,
    timeSavedHours: 0,
    approvalRate: 0,
    sessionsTrend: 0,
    actionsTrend: 0,
    hourlyRate: 150,
  });
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [entities, setEntities] = useState<Array<{ id: string; name: string }>>([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<'all' | 'recordings' | 'before-date' | 'for-entity'>('all');
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showClearDropdown, setShowClearDropdown] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Fetch entities on mount
  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const res = await fetch('/api/entities');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.data)) {
            setEntities(json.data);
          }
        }
      } catch {
        // Silently handle error
      }
    };
    fetchEntities();
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (channelFilter) params.set('channel', channelFilter);
      if (entityFilter) params.set('entity', entityFilter);
      if (dateStart) params.set('dateStart', dateStart);
      if (dateEnd) params.set('dateEnd', dateEnd);

      const res = await fetch(`/api/shadow/conversations?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const sessionsData: SessionEntry[] = (json.data.sessions ?? json.data ?? []).map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: any) => ({
              id: s.id,
              date: s.startedAt ?? s.date ?? new Date().toISOString(),
              duration: formatDuration(s.totalDurationSeconds ?? s.durationSeconds ?? 0),
              durationSeconds: s.totalDurationSeconds ?? s.durationSeconds ?? 0,
              channel: s.currentChannel ?? s.channel ?? 'web',
              messageCount: s.messageCount ?? 0,
              summary: s.aiSummary ?? s.summary ?? 'No summary available',
              messages: s.messages,
              actions: s.actions,
              audioUrl: s.audioUrl,
              entityName: s.entityName,
              actionsCount: s.actionsCount,
              outcomes: s.outcomes,
            })
          );
          setSessions(sessionsData);

          // Compute stats
          const totalSessions = sessionsData.length;
          const voiceCount = sessionsData.filter(
            (s) => s.channel === 'phone' || s.channel === 'voice'
          ).length;
          const voicePercent =
            totalSessions > 0 ? Math.round((voiceCount / totalSessions) * 100) : 0;
          const actionsExecuted = sessionsData.reduce(
            (sum, s) => sum + (s.actionsCount ?? s.actions?.length ?? 0),
            0
          );
          const totalSeconds = sessionsData.reduce(
            (sum, s) => sum + s.durationSeconds,
            0
          );
          const timeSavedHours = Math.round((totalSeconds / 3600) * 1.5 * 10) / 10;

          setStats({
            totalSessions,
            voicePercent,
            actionsExecuted,
            timeSavedHours,
            approvalRate: json.data.approvalRate ?? 0,
            sessionsTrend: json.data.sessionsTrend ?? 0,
            actionsTrend: json.data.actionsTrend ?? 0,
            hourlyRate: json.data.hourlyRate ?? 150,
          });
        }
      }
    } catch {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  }, [searchQuery, channelFilter, entityFilter, dateStart, dateEnd]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Suppress unused variable lint by consuming userId
  void userId;

  const handleExport = async (format: string) => {
    setExporting(true);
    setShowExportDropdown(false);
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      if (dateStart) params.set('dateStart', dateStart);
      if (dateEnd) params.set('dateEnd', dateEnd);

      const res = await fetch(`/api/shadow/export?${params.toString()}`, { method: 'POST' });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const extensions: Record<string, string> = {
          json: 'json',
          pdf: 'pdf',
          recordings: 'zip',
          transcripts: 'txt',
        };
        a.download = `shadow-history-${new Date().toISOString().slice(0, 10)}.${extensions[format] || 'json'}`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch {
      // Handle error silently
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const body: Record<string, string> = { mode: clearMode };
      if (clearMode === 'before-date' && dateStart) body.beforeDate = dateStart;
      if (clearMode === 'for-entity' && entityFilter) body.entity = entityFilter;

      const res = await fetch('/api/shadow/delete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (clearMode === 'all') {
          setSessions([]);
          setStats({
            totalSessions: 0,
            voicePercent: 0,
            actionsExecuted: 0,
            timeSavedHours: 0,
            approvalRate: 0,
            sessionsTrend: 0,
            actionsTrend: 0,
            hourlyRate: 150,
          });
        } else {
          // Refresh to get updated data
          fetchHistory();
        }
      }
    } catch {
      // Handle error silently
    } finally {
      setClearing(false);
      setShowClearModal(false);
      setConfirmText('');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/shadow/conversations/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setExpandedSession(null);
      }
    } catch {
      // Handle error silently
    }
  };

  const handleCopyTranscript = (session: SessionEntry) => {
    if (!session.messages || session.messages.length === 0) return;
    const transcript = session.messages
      .map((m) => `${m.role === 'user' ? 'You' : 'Shadow'}: ${m.content}`)
      .join('\n\n');
    navigator.clipboard.writeText(transcript);
  };

  const openClearModal = (mode: 'all' | 'recordings' | 'before-date' | 'for-entity') => {
    setClearMode(mode);
    setConfirmText('');
    setShowClearModal(true);
    setShowClearDropdown(false);
  };

  const channelIcon = (channel: string) => {
    switch (channel) {
      case 'phone':
        return (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        );
      case 'voice':
        return (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        );
      case 'mobile':
        return (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        );
      default:
        return (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-400">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        );
    }
  };

  const channelLabel = (channel: string) => {
    switch (channel) {
      case 'phone': return 'Phone';
      case 'voice': return 'Voice';
      case 'mobile': return 'Mobile';
      default: return 'Web';
    }
  };

  const outcomeBadgeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'decision': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'commitment': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'follow-up': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  const trendIndicator = (value: number) => {
    if (value === 0) return null;
    if (value > 0) {
      return (
        <span className="text-xs text-green-600 dark:text-green-400">
          ↑ {value}% vs last month
        </span>
      );
    }
    return (
      <span className="text-xs text-red-600 dark:text-red-400">
        ↓ {Math.abs(value)}% vs last month
      </span>
    );
  };

  const clearModeLabels: Record<string, string> = {
    all: 'Clear All History',
    recordings: 'Clear Recordings Only',
    'before-date': 'Clear History Before Date',
    'for-entity': 'Clear History for Entity',
  };

  return (
    <div className="space-y-6">
      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalSessions}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Sessions</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">last 30 days</p>
          {stats.totalSessions > 0 && trendIndicator(stats.sessionsTrend)}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.voicePercent}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Voice Sessions</p>
          <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all"
              style={{ width: `${stats.voicePercent}%` }}
            />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.actionsExecuted}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Actions Executed</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">all sessions</p>
          {stats.actionsExecuted > 0 && trendIndicator(stats.actionsTrend)}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.timeSavedHours}h</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Time Saved</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">estimated</p>
          {stats.timeSavedHours > 0 && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
              ≈ ${Math.round(stats.timeSavedHours * stats.hourlyRate).toLocaleString()} at ${stats.hourlyRate}/hr
            </p>
          )}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.approvalRate}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Approval Rate</p>
          <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${stats.approvalRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Retention Info Bar */}
      <RetentionInfoBar />

      {/* Session Analytics Chart */}
      <SessionAnalyticsChart sessions={sessions} stats={stats} />

      {/* Search & Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">All Channels</option>
            <option value="web">Web</option>
            <option value="phone">Phone</option>
            <option value="voice">Voice</option>
            <option value="mobile">Mobile</option>
          </select>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">All Entities</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Start date"
          />
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="End date"
          />
        </div>
      </div>

      {/* Session List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mx-auto text-gray-300 dark:text-gray-600 mb-3">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">No sessions found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Start a conversation with Shadow to see your history here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {sessions.map((session) => (
              <div key={session.id}>
                <button
                  onClick={() =>
                    setExpandedSession(
                      expandedSession === session.id ? null : session.id
                    )
                  }
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="shrink-0 flex items-center gap-1.5">
                    {channelIcon(session.channel)}
                    <span className="text-xs text-gray-400 dark:text-gray-500">{channelLabel(session.channel)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(session.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(session.date).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {session.summary}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {session.entityName || 'All'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {session.actionsCount ?? session.actions?.length ?? 0} actions
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{session.duration}</span>
                    <span>{session.messageCount} msgs</span>
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className={`transition-transform ${
                        expandedSession === session.id ? 'rotate-180' : ''
                      }`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Expanded Session */}
                {expandedSession === session.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50">
                    {/* Transcript */}
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Transcript
                      </h4>
                      <div className="max-h-64 overflow-y-auto space-y-2 bg-gray-50 dark:bg-gray-900/50 rounded-md p-3">
                        {session.messages && session.messages.length > 0 ? (
                          session.messages.map((msg, i) => (
                            <div
                              key={i}
                              className={`flex gap-2 ${
                                msg.role === 'user' ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              <div
                                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                  msg.role === 'user'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                                    : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                <p className="text-xs font-medium mb-0.5 opacity-70">
                                  {msg.role === 'user' ? 'You' : 'Shadow'}
                                </p>
                                <p>{msg.content}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                            Transcript not available for this session.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions Taken */}
                    {session.actions && session.actions.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                          Actions Taken
                        </h4>
                        <ul className="space-y-1">
                          {session.actions.map((action, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300"
                            >
                              <div className="flex items-center gap-2">
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-green-500 shrink-0">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                                {action}
                              </div>
                              <button
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 ml-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Placeholder — would open consent receipt modal
                                }}
                              >
                                View consent receipt
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Outcomes */}
                    {session.outcomes && session.outcomes.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                          Outcomes
                        </h4>
                        <div className="space-y-2">
                          {session.outcomes.map((o, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span
                                className={`inline-block text-xs font-medium px-2 py-0.5 rounded shrink-0 ${outcomeBadgeColor(o.type)}`}
                              >
                                {o.type}
                              </span>
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {o.description}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Audio Playback Placeholder */}
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Audio Recording
                      </h4>
                      <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-md p-3">
                        <button className="p-2 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-gray-600 dark:text-gray-300">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </button>
                        <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-600 rounded-full">
                          <div className="w-0 h-1 bg-blue-500 rounded-full" />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {session.duration}
                        </span>
                      </div>
                    </div>

                    {/* Session Actions */}
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => handleCopyTranscript(session)}
                        disabled={!session.messages || session.messages.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy transcript
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-300 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Delete this session
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowExportDropdown(!showExportDropdown);
              setShowClearDropdown(false);
            }}
            disabled={exporting || sessions.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? 'Exporting...' : 'Export History'}
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showExportDropdown && (
            <div className="absolute left-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
              <div className="py-1">
                <button
                  onClick={() => handleExport('json')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Export all (JSON)
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Export all (PDF summary)
                </button>
                <button
                  onClick={() => handleExport('recordings')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Export recordings only (ZIP)
                </button>
                <button
                  onClick={() => handleExport('transcripts')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Export transcripts only (TXT)
                </button>
                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                <button
                  onClick={() => {
                    setShowExportDropdown(false);
                    // Date range is already set via the filter inputs
                    handleExport('json');
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Export for date range...
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clear Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowClearDropdown(!showClearDropdown);
              setShowExportDropdown(false);
            }}
            disabled={sessions.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Clear History
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showClearDropdown && (
            <div className="absolute left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
              <div className="py-1">
                <button
                  onClick={() => openClearModal('all')}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10"
                >
                  Clear all history
                </button>
                <button
                  onClick={() => openClearModal('recordings')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Clear recordings only (keep transcripts)
                </button>
                <button
                  onClick={() => openClearModal('before-date')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Clear history before date...
                </button>
                <button
                  onClick={() => openClearModal('for-entity')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Clear history for entity...
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-red-600 dark:text-red-400">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {clearModeLabels[clearMode]}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              {clearMode === 'all' && (
                <>Are you sure you want to delete all {stats.totalSessions} session(s)? This will permanently remove all conversation history, transcripts, and recordings.</>
              )}
              {clearMode === 'recordings' && (
                <>This will permanently remove all audio recordings but keep transcripts and session data intact.</>
              )}
              {clearMode === 'before-date' && (
                <>This will permanently remove all sessions before the selected start date. Set the start date in the filters above before confirming.</>
              )}
              {clearMode === 'for-entity' && (
                <>This will permanently remove all sessions for the selected entity. Select an entity in the filters above before confirming.</>
              )}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
              Consent receipts will be retained for regulatory compliance.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type <span className="font-bold">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => {
                  setShowClearModal(false);
                  setConfirmText('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearing || confirmText !== 'DELETE'}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {clearing ? 'Clearing...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}
