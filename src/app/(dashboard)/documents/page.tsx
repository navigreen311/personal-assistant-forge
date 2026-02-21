'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { DocumentTemplate } from '@/modules/documents/types';
import type { Entity, DocumentType, Document } from '@/shared/types';
import { TemplateSelector } from '@/modules/documents/components/TemplateSelector';

// ---------------------------------------------------------------------------
// Dynamic import for NewDocumentModal (may not exist yet)
// ---------------------------------------------------------------------------

const NewDocumentModal = dynamic(
  () => import('@/modules/documents/components/NewDocumentModal').catch(() => {
    // Module doesn't exist yet - return a fallback component
    return {
      default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; onCreated?: () => void }) => {
        if (!isOpen) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">New Document</h2>
              <p className="text-sm text-gray-500 mb-4">
                The document creation modal is coming soon. For now, use the Templates tab to generate documents from templates.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        );
      },
    };
  }),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'documents' | 'templates' | 'clauses';

interface DocumentFilters {
  search: string;
  entityId: string;
  type: string;
  status: string;
  sort: string;
}

interface DocumentStats {
  total: number;
  drafts: number;
  pendingReview: number;
  signed: number;
}

// ---------------------------------------------------------------------------
// Badge color configs
// ---------------------------------------------------------------------------

const TYPE_BADGE_COLORS: Record<DocumentType, { bg: string; text: string }> = {
  BRIEF: { bg: 'bg-blue-100', text: 'text-blue-700' },
  MEMO: { bg: 'bg-teal-100', text: 'text-teal-700' },
  SOP: { bg: 'bg-purple-100', text: 'text-purple-700' },
  MINUTES: { bg: 'bg-gray-100', text: 'text-gray-700' },
  INVOICE: { bg: 'bg-green-100', text: 'text-green-700' },
  SOW: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  PROPOSAL: { bg: 'bg-amber-100', text: 'text-amber-700' },
  CONTRACT: { bg: 'bg-rose-100', text: 'text-rose-700' },
  REPORT: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  DECK: { bg: 'bg-orange-100', text: 'text-orange-700' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700' },
  REVIEW: { label: 'In Review', bg: 'bg-blue-100', text: 'text-blue-700' },
  APPROVED: { label: 'Approved', bg: 'bg-green-100', text: 'text-green-700' },
  SIGNED: { label: 'Signed', bg: 'bg-green-100', text: 'text-green-700' },
  ARCHIVED: { label: 'Archived', bg: 'bg-gray-100', text: 'text-gray-400' },
};

const INITIAL_FILTERS: DocumentFilters = {
  search: '',
  entityId: '',
  type: '',
  status: '',
  sort: 'updatedAt',
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  // Data state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>('documents');
  const [filters, setFilters] = useState<DocumentFilters>(INITIAL_FILTERS);
  const [showNewDocument, setShowNewDocument] = useState(false);

  // Template tab state
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateEntityFilter, setTemplateEntityFilter] = useState('');

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.entityId) params.set('entityId', filters.entityId);
      if (filters.type) params.set('type', filters.type);
      if (filters.status) params.set('status', filters.status);
      if (filters.sort) params.set('sort', filters.sort);

      const res = await fetch(`/api/documents?${params.toString()}`);
      const json = await res.json();

      if (json.success === false) {
        throw new Error(json.error?.message ?? 'Failed to load documents');
      }

      setDocuments(json.data ?? []);
    } catch (err) {
      // If the documents API doesn't exist yet, gracefully handle
      setDocuments([]);
      if (err instanceof Error && !err.message.includes('fetch')) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [filters.search, filters.entityId, filters.type, filters.status, filters.sort]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/documents/templates');
      const json = await res.json();
      if (json.success && json.data) {
        setTemplates(json.data);
      }
    } catch {
      // Templates API may not be ready
    }
  }, []);

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/entities');
      const json = await res.json();
      if (json.data) {
        setEntities(json.data);
      }
    } catch {
      // Entities are optional for filter dropdown
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // ---------------------------------------------------------------------------
  // Computed stats
  // ---------------------------------------------------------------------------

  const stats: DocumentStats = useMemo(() => {
    const total = documents.length;
    const drafts = documents.filter((d) => d.status === 'DRAFT').length;
    const pendingReview = documents.filter((d) => d.status === 'REVIEW').length;
    const signed = documents.filter((d) => d.status === 'SIGNED').length;
    return { total, drafts, pendingReview, signed };
  }, [documents]);

  // ---------------------------------------------------------------------------
  // Filtered & sorted documents
  // ---------------------------------------------------------------------------

  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    // Client-side search fallback (in case API doesn't support it)
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q));
    }

    // Sort
    result.sort((a, b) => {
      switch (filters.sort) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'updatedAt':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [documents, filters.search, filters.sort]);

  // ---------------------------------------------------------------------------
  // Filtered templates (for Templates tab with extra filters)
  // ---------------------------------------------------------------------------

  const filteredTemplates = useMemo(() => {
    let result = [...templates];
    if (templateSearch) {
      const q = templateSearch.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.type.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
      );
    }
    return result;
  }, [templates, templateSearch]);

  // ---------------------------------------------------------------------------
  // Entity name helper
  // ---------------------------------------------------------------------------

  const getEntityName = useCallback(
    (entityId: string) => {
      const entity = entities.find((e) => e.id === entityId);
      return entity?.name ?? 'Unknown Entity';
    },
    [entities],
  );

  // ---------------------------------------------------------------------------
  // Tab definitions
  // ---------------------------------------------------------------------------

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'documents', label: 'My Documents' },
    { key: 'templates', label: 'Templates' },
    { key: 'clauses', label: 'Clause Library' },
  ];

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-80 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-10 w-40 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
        {/* Tab skeleton */}
        <div className="h-10 w-72 bg-gray-200 rounded animate-pulse" />
        {/* Cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-lg p-4 h-48" />
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Page header                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Studio</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create, manage, and track documents across all entities.
          </p>
        </div>
        <button
          onClick={() => setShowNewDocument(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          + New Document
        </button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Stats bar                                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Docs</p>
          <p className="text-2xl font-bold text-gray-600 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Drafts</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.drafts}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Pending Review</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.pendingReview}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Signed</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.signed}</p>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tab bar                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tab content                                                        */}
      {/* ----------------------------------------------------------------- */}

      {/* ===== MY DOCUMENTS TAB ===== */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Search input */}
            <div className="relative flex-1 max-w-md">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search documents..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Entity dropdown */}
              <select
                value={filters.entityId}
                onChange={(e) => setFilters({ ...filters, entityId: e.target.value })}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Entities</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>

              {/* Type dropdown */}
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Types</option>
                <option value="BRIEF">Brief</option>
                <option value="MEMO">Memo</option>
                <option value="SOP">SOP</option>
                <option value="MINUTES">Minutes</option>
                <option value="INVOICE">Invoice</option>
                <option value="SOW">SOW</option>
                <option value="PROPOSAL">Proposal</option>
                <option value="CONTRACT">Contract</option>
                <option value="REPORT">Report</option>
                <option value="DECK">Deck</option>
              </select>

              {/* Status dropdown */}
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="REVIEW">In Review</option>
                <option value="APPROVED">Approved</option>
                <option value="SIGNED">Signed</option>
                <option value="ARCHIVED">Archived</option>
              </select>

              {/* Sort dropdown */}
              <select
                value={filters.sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="updatedAt">Sort: Last Updated</option>
                <option value="title">Sort: Title A-Z</option>
                <option value="type">Sort: Type</option>
                <option value="status">Sort: Status</option>
              </select>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              {error}
              <button
                onClick={fetchDocuments}
                className="ml-3 text-red-800 underline hover:no-underline font-medium"
              >
                Retry
              </button>
            </div>
          )}

          {/* Document cards or empty state */}
          {filteredDocuments.length === 0 && !error ? (
            /* ----- Empty state ----- */
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">No documents yet</h3>
              <p className="text-sm text-gray-500 text-center max-w-md mb-6">
                Create your first document from a template or with AI. Documents help you
                generate, track, and manage business content across all your entities.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewDocument(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Document
                </button>
                <button
                  onClick={() => setActiveTab('templates')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Browse Templates
                </button>
              </div>
            </div>
          ) : (
            /* ----- Document cards grid ----- */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((doc) => {
                const typeColors = TYPE_BADGE_COLORS[doc.type] ?? { bg: 'bg-gray-100', text: 'text-gray-700' };
                const statusCfg = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.DRAFT;

                return (
                  <div
                    key={doc.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    {/* Top row: type badge + entity pill + status */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${typeColors.bg} ${typeColors.text}`}>
                        {doc.type}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-600">
                        {getEntityName(doc.entityId)}
                      </span>
                      <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate cursor-pointer hover:text-blue-600 transition-colors">
                      {doc.title}
                    </h3>

                    {/* Template source */}
                    {doc.templateId && (
                      <p className="text-xs text-gray-400 mb-2">
                        From template: {templates.find((t) => t.id === doc.templateId)?.name ?? doc.templateId}
                      </p>
                    )}

                    {/* Version + last edit */}
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-3">
                      <span>v{doc.version}</span>
                      <span className="text-gray-300">|</span>
                      <span>
                        Edited {new Date(doc.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    {/* Citation count */}
                    {doc.citations && doc.citations.length > 0 && (
                      <div className="text-[10px] text-gray-400 mb-3">
                        {doc.citations.length} citation{doc.citations.length !== 1 ? 's' : ''}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 border-t border-gray-100 pt-3">
                      <button className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                        Edit
                      </button>
                      <button className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                        Preview
                      </button>
                      <button className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                        Share
                      </button>
                      {doc.status === 'APPROVED' && (
                        <button className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors">
                          Sign
                        </button>
                      )}
                      <button className="ml-auto px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== TEMPLATES TAB ===== */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {/* Templates filter bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Entity filter for templates */}
            <select
              value={templateEntityFilter}
              onChange={(e) => setTemplateEntityFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Entities</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>

          {/* Render TemplateSelector with filtered templates */}
          <TemplateSelector
            templates={filteredTemplates}
            onSelect={(id) => {
              // Navigate to template editor - for now just log
              console.log('Selected template:', id);
            }}
          />

          {filteredTemplates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">No templates found</h3>
              <p className="text-sm text-gray-500 text-center max-w-sm">
                {templateSearch
                  ? 'Try adjusting your search or filters.'
                  : 'Document templates will appear here once they are configured.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== CLAUSE LIBRARY TAB ===== */}
      {activeTab === 'clauses' && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Clause Library</h3>
          <p className="text-sm text-gray-500 text-center max-w-md">
            Clause Library coming soon. Reusable contract and legal clauses will be
            available here for quick insertion into your documents.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* New Document Modal                                                 */}
      {/* ----------------------------------------------------------------- */}
      {showNewDocument && (
        <NewDocumentModal
          isOpen={showNewDocument}
          onClose={() => setShowNewDocument(false)}
          onCreated={() => {
            setShowNewDocument(false);
            fetchDocuments();
          }}
        />
      )}
    </div>
  );
}
