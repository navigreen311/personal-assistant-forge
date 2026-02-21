'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import Link from 'next/link';
import type { Document, Citation } from '@/shared/types/index';

// =============================================================================
// Helpers
// =============================================================================

function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parseOutline(content: string): { level: number; text: string; index: number }[] {
  const lines = content.split('\n');
  const headings: { level: number; text: string; index: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2], index: i });
    }
  }
  return headings;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  SIGNED: 'bg-blue-100 text-blue-700',
  ARCHIVED: 'bg-purple-100 text-purple-700',
};

// =============================================================================
// Main Page Component
// =============================================================================

export default function DocumentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // --- Core state ---
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Editor state ---
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [showPreview, setShowPreview] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const [newCitationText, setNewCitationText] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);

  // --- Refs ---
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // --- Fetch document ---
  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await fetch(`/api/documents/${id}`);
        if (!res.ok) {
          setError(`Failed to load document (${res.status})`);
          return;
        }
        const json = await res.json();
        if (json.success) {
          const data = json.data as Document;
          setDoc(data);
          setTitle(data.title);
          setContent(data.content ?? '');
          setCitations(data.citations ?? []);
        } else {
          setError(json.error?.message ?? 'Failed to load document');
        }
      } catch {
        setError('Network error loading document');
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [id]);

  // --- Auto-save with debounce ---
  const saveDocument = useCallback(
    async (newTitle: string, newContent: string, newCitations: Citation[]) => {
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/documents/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newTitle,
            content: newContent,
            citations: newCitations,
          }),
        });
        if (res.ok) {
          setSaveStatus('saved');
          const json = await res.json();
          if (json.success && json.data) {
            setDoc(json.data);
          }
        } else {
          setSaveStatus('unsaved');
        }
      } catch {
        setSaveStatus('unsaved');
      }
    },
    [id],
  );

  const scheduleSave = useCallback(
    (newTitle: string, newContent: string, newCitations: Citation[]) => {
      setSaveStatus('unsaved');
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveDocument(newTitle, newContent, newCitations);
      }, 3000);
    },
    [saveDocument],
  );

  // --- Content change handler ---
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    scheduleSave(title, newContent, citations);
  };

  // --- Title change handler ---
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    scheduleSave(newTitle, content, citations);
  };

  // --- Manual save ---
  const handleManualSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveDocument(title, content, citations);
  };

  // --- Toolbar formatting ---
  const insertFormatting = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const newContent =
      content.substring(0, start) + prefix + selected + suffix + content.substring(end);
    handleContentChange(newContent);
    // Restore focus
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const toolbarActions = [
    { label: 'B', title: 'Bold', action: () => insertFormatting('**', '**') },
    { label: 'I', title: 'Italic', action: () => insertFormatting('*', '*') },
    { label: 'H1', title: 'Heading 1', action: () => insertFormatting('# ') },
    { label: 'H2', title: 'Heading 2', action: () => insertFormatting('## ') },
    { label: 'H3', title: 'Heading 3', action: () => insertFormatting('### ') },
    { label: 'List', title: 'Bullet List', action: () => insertFormatting('- ') },
    { label: 'Link', title: 'Insert Link', action: () => insertFormatting('[', '](url)') },
  ];

  const aiActions = [
    { label: 'Expand', emoji: '\u2728' },
    { label: 'Rewrite', emoji: '\u2728' },
    { label: 'Make Formal', emoji: '\u2728' },
    { label: 'Simplify', emoji: '\u2728' },
  ];

  // --- Citation management ---
  const handleAddCitation = () => {
    if (!newCitationText.trim()) return;
    const newCitation: Citation = {
      id: `cite-${Date.now()}`,
      sourceType: 'DOCUMENT',
      sourceId: 'manual',
      excerpt: newCitationText.trim(),
    };
    const updated = [...citations, newCitation];
    setCitations(updated);
    setNewCitationText('');
    scheduleSave(title, content, updated);
  };

  const handleRemoveCitation = (citationId: string) => {
    const updated = citations.filter((c) => c.id !== citationId);
    setCitations(updated);
    scheduleSave(title, content, updated);
  };

  // --- Outline scroll ---
  const scrollToLine = (lineIndex: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const lines = content.split('\n');
    let charIndex = 0;
    for (let i = 0; i < lineIndex && i < lines.length; i++) {
      charIndex += lines[i].length + 1;
    }
    textarea.focus();
    textarea.setSelectionRange(charIndex, charIndex);
    // Approximate scroll position
    const lineHeight = 20;
    textarea.scrollTop = lineIndex * lineHeight;
  };

  // --- Outline headings ---
  const outline = parseOutline(content);

  // --- Simple markdown preview ---
  const renderPreview = (md: string): string => {
    return md
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-6 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-3">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 underline">$1</a>')
      .replace(/\n/g, '<br />');
  };

  // =========================================================================
  // Loading State
  // =========================================================================
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-40 bg-gray-200 rounded" />
          <div className="h-8 w-96 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
          <div className="flex gap-4">
            <div className="w-48 h-96 bg-gray-200 rounded-lg" />
            <div className="flex-1 h-96 bg-gray-200 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Error State
  // =========================================================================
  if (error || !doc) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link
          href="/documents"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-6"
        >
          &larr; Back to Documents
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600 font-medium">{error ?? 'Document not found.'}</p>
          <Link
            href="/documents"
            className="mt-4 inline-block text-sm text-blue-600 hover:underline"
          >
            Return to Documents
          </Link>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <div className="flex flex-col h-screen">
      {/* ================================================================= */}
      {/* 1. TOP BAR */}
      {/* ================================================================= */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <Link
          href="/documents"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Back to Documents
        </Link>

        <div className="flex items-center gap-3">
          {/* Auto-save indicator */}
          <span
            className={`text-xs font-medium ${
              saveStatus === 'saved'
                ? 'text-green-600'
                : saveStatus === 'saving'
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }`}
          >
            {saveStatus === 'saved'
              ? 'Saved'
              : saveStatus === 'saving'
                ? 'Saving...'
                : 'Unsaved changes'}
          </span>

          <button
            onClick={handleManualSave}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span aria-hidden="true">{'\uD83D\uDCBE'}</span> Save
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${
              showPreview
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span aria-hidden="true">{'\uD83D\uDC41'}</span> Preview
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <span aria-hidden="true">{'\uD83D\uDCE4'}</span> Export
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. DOCUMENT INFO BAR */}
      {/* ================================================================= */}
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Editable title */}
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditingTitle(false);
              }}
              className="text-xl font-bold text-gray-900 bg-white border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          ) : (
            <h1
              onClick={() => setEditingTitle(true)}
              className="text-xl font-bold text-gray-900 cursor-pointer hover:bg-white hover:rounded hover:px-2 hover:py-0.5 transition-all"
              title="Click to edit title"
            >
              {title}
            </h1>
          )}

          {/* Entity pill */}
          {doc.entityId && (
            <span className="inline-flex items-center rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-700">
              {doc.entityId}
            </span>
          )}

          {/* Status badge */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              STATUS_COLORS[doc.status] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {doc.status}
          </span>

          {/* Version */}
          <span className="text-xs font-medium text-gray-500">v{doc.version}</span>

          {/* Last edited */}
          <span className="text-xs text-gray-400">
            Last edited {timeAgo(doc.updatedAt)}
          </span>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. MAIN EDITOR (two-column layout) */}
      {/* ================================================================= */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR - Outline */}
        {!outlineCollapsed && (
          <div className="w-48 bg-gray-50 border-r border-gray-200 overflow-y-auto p-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Outline
              </h3>
              <button
                onClick={() => setOutlineCollapsed(true)}
                className="text-gray-400 hover:text-gray-600 text-xs"
                title="Collapse outline"
              >
                {'\u2190'}
              </button>
            </div>
            {outline.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                No headings found. Use # or ## in your content.
              </p>
            ) : (
              <nav className="space-y-1">
                {outline.map((heading, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToLine(heading.index)}
                    className={`block w-full text-left text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded px-2 py-1 truncate transition-colors ${
                      heading.level === 1
                        ? 'font-semibold'
                        : heading.level === 2
                          ? 'pl-4 font-medium'
                          : 'pl-6'
                    }`}
                    title={heading.text}
                  >
                    {heading.text}
                  </button>
                ))}
              </nav>
            )}
          </div>
        )}

        {/* Collapsed outline toggle */}
        {outlineCollapsed && (
          <button
            onClick={() => setOutlineCollapsed(false)}
            className="flex-shrink-0 w-8 bg-gray-50 border-r border-gray-200 flex items-center justify-center hover:bg-gray-100"
            title="Expand outline"
          >
            <span className="text-gray-400 text-xs">{'\u2192'}</span>
          </button>
        )}

        {/* RIGHT MAIN AREA */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Formatting toolbar */}
          <div className="border-b border-gray-200 bg-white px-4 py-2">
            <div className="flex items-center gap-1 flex-wrap">
              {toolbarActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.action}
                  title={action.title}
                  className="rounded px-2.5 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  {action.label}
                </button>
              ))}

              <span className="mx-2 h-5 w-px bg-gray-300" />

              {/* AI tools */}
              {aiActions.map((action) => (
                <button
                  key={action.label}
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-sm font-medium text-purple-600 hover:bg-purple-50 transition-colors"
                >
                  <span aria-hidden="true">{action.emoji}</span> {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-4">
            {showPreview ? (
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: renderPreview(content) }}
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                className="w-full h-full min-h-[500px] resize-none bg-white border border-gray-200 rounded-lg p-4 font-mono text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Start writing in markdown..."
                spellCheck
              />
            )}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 4. CITATIONS PANEL (collapsible) */}
      {/* ================================================================= */}
      <div className="border-t border-gray-200 bg-white">
        <button
          onClick={() => setShowCitations(!showCitations)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <span>Citations ({citations.length})</span>
          <span className="text-gray-400">{showCitations ? '\u25B2' : '\u25BC'}</span>
        </button>

        {showCitations && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-3 max-h-60 overflow-y-auto">
            {citations.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No citations added yet.</p>
            ) : (
              <ul className="space-y-2">
                {citations.map((citation) => (
                  <li
                    key={citation.id}
                    className="flex items-start justify-between gap-2 text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2"
                  >
                    <span className="flex items-start gap-1.5">
                      <span className="shrink-0" aria-hidden="true">
                        {'\uD83D\uDCCE'}
                      </span>
                      <span>{citation.excerpt}</span>
                    </span>
                    <button
                      onClick={() => handleRemoveCitation(citation.id)}
                      className="shrink-0 text-red-400 hover:text-red-600 text-xs font-medium"
                      title="Remove citation"
                    >
                      {'\u2715'}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add citation input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newCitationText}
                onChange={(e) => setNewCitationText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCitation();
                }}
                placeholder="Enter citation source text..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <button
                onClick={handleAddCitation}
                disabled={!newCitationText.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add citation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* 5. EXPORT BAR (bottom) */}
      {/* ================================================================= */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2">
          {(['DOCX', 'PDF', 'Markdown', 'HTML'] as const).map((format) => (
            <button
              key={format}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {format}
            </button>
          ))}
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          <span aria-hidden="true">{'\u270D'}</span> Send for Signature
        </button>
      </div>
    </div>
  );
}
