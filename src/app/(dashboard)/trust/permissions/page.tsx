'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { PermissionSet } from '@/engines/trust-ui/types';

type PermissionKey = 'read' | 'draft' | 'execute';

/** Category definitions for grouping integrations */
const CATEGORIES: { label: string; description: string; ids: string[] }[] = [
  {
    label: 'Communication',
    description: 'Email, messaging, and collaboration tools',
    ids: ['email', 'slack', 'inbox', 'voice'],
  },
  {
    label: 'Tasks & Calendar',
    description: 'Task management and scheduling',
    ids: ['calendar', 'tasks'],
  },
  {
    label: 'Financial',
    description: 'Billing, payments, and financial data',
    ids: ['billing', 'finance'],
  },
  {
    label: 'Data & Knowledge',
    description: 'Documents, knowledge base, and storage',
    ids: ['drive', 'crm', 'knowledge', 'documents'],
  },
];

/** Derive permission level indicator from permission flags */
function getPermissionLevel(perm: PermissionSet): {
  label: string;
  icon: string;
  className: string;
} {
  if (perm.execute) {
    return {
      label: 'Auto',
      icon: '\u2705',
      className:
        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    };
  }
  if (perm.draft) {
    return {
      label: 'Approval',
      icon: '\u26A0\uFE0F',
      className:
        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    };
  }
  return {
    label: 'Blocked',
    icon: '\uD83D\uDD12',
    className:
      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
}

const DEFAULT_PERMISSIONS: Partial<Record<PermissionKey, boolean>> = {
  read: true,
  draft: true,
  execute: false,
};

export default function PermissionsPage() {
  const { data: session, status } = useSession();
  const [permissions, setPermissions] = useState<PermissionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const userId = session?.user?.id ?? '';

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function fetchPermissions() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/permissions?userId=${encodeURIComponent(userId)}`
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch permissions: ${res.status}`);
        }

        const data = await res.json();

        if (!cancelled) {
          setPermissions(data.data ?? data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPermissions();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleToggle = useCallback(
    async (integrationId: string, key: PermissionKey, currentValue: boolean) => {
      const updateKey = `${integrationId}:${key}`;
      setUpdating(updateKey);

      try {
        const res = await fetch(`/api/permissions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            integrationId,
            [key]: !currentValue,
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to update permission: ${res.status}`);
        }

        setPermissions((prev) =>
          prev.map((p) =>
            p.integrationId === integrationId
              ? { ...p, [key]: !currentValue }
              : p
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update');
      } finally {
        setUpdating(null);
      }
    },
    [userId]
  );

  const handleResetDefaults = useCallback(async () => {
    setResetting(true);
    setError(null);

    try {
      await Promise.all(
        permissions.map((perm) =>
          fetch(`/api/permissions`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              integrationId: perm.integrationId,
              ...DEFAULT_PERMISSIONS,
            }),
          })
        )
      );

      setPermissions((prev) =>
        prev.map((p) => ({
          ...p,
          read: DEFAULT_PERMISSIONS.read ?? true,
          draft: DEFAULT_PERMISSIONS.draft ?? true,
          execute: DEFAULT_PERMISSIONS.execute ?? false,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setResetting(false);
    }
  }, [permissions, userId]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
        <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
          Loading permissions...
        </span>
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-900/50 dark:bg-yellow-900/20">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
          Please sign in to manage permissions.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-800 dark:text-red-400">
          Error loading permissions
        </p>
        <p className="mt-1 text-xs text-red-600 dark:text-red-500">{error}</p>
      </div>
    );
  }

  // Group permissions by category
  const categorized = CATEGORIES.map((cat) => ({
    ...cat,
    permissions: permissions.filter((p) => cat.ids.includes(p.integrationId)),
  }));

  // Permissions not matched to any category
  const allCategoryIds = CATEGORIES.flatMap((c) => c.ids);
  const uncategorized = permissions.filter(
    (p) => !allCategoryIds.includes(p.integrationId)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            AI Permissions
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Control what AI can do autonomously vs. with your approval.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetDefaults}
          disabled={resetting}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {resetting ? 'Resetting...' : 'Reset to defaults'}
        </button>
      </div>

      {/* Permission Level Legend */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
            {'\u2705'} Auto
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            AI acts autonomously
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            {'\u26A0\uFE0F'} Approval
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            AI drafts, you approve
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
            {'\uD83D\uDD12'} Blocked
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            AI cannot access
          </span>
        </div>
      </div>

      {/* Categorized Permission Groups */}
      {categorized.map((cat) => {
        if (cat.permissions.length === 0) return null;

        return (
          <section key={cat.label} className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {cat.label}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {cat.description}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cat.permissions.map((perm) => {
                const level = getPermissionLevel(perm);

                return (
                  <div
                    key={perm.integrationId}
                    className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {perm.integrationName}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${level.className}`}
                      >
                        {level.icon} {level.label}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {(['read', 'draft', 'execute'] as const).map((key) => {
                        const isUpdating =
                          updating === `${perm.integrationId}:${key}`;

                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between"
                          >
                            <span className="text-sm capitalize text-zinc-600 dark:text-zinc-400">
                              {key}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={perm[key]}
                              aria-label={`${key} permission for ${perm.integrationName}`}
                              disabled={isUpdating}
                              onClick={() =>
                                handleToggle(perm.integrationId, key, perm[key])
                              }
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:focus:ring-offset-zinc-900 ${
                                perm[key]
                                  ? 'bg-blue-600'
                                  : 'bg-zinc-300 dark:bg-zinc-600'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                                  perm[key] ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Uncategorized permissions (fallback) */}
      {uncategorized.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Other
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Additional integrations
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {uncategorized.map((perm) => {
              const level = getPermissionLevel(perm);

              return (
                <div
                  key={perm.integrationId}
                  className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {perm.integrationName}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${level.className}`}
                    >
                      {level.icon} {level.label}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {(['read', 'draft', 'execute'] as const).map((key) => {
                      const isUpdating =
                        updating === `${perm.integrationId}:${key}`;

                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between"
                        >
                          <span className="text-sm capitalize text-zinc-600 dark:text-zinc-400">
                            {key}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={perm[key]}
                            aria-label={`${key} permission for ${perm.integrationName}`}
                            disabled={isUpdating}
                            onClick={() =>
                              handleToggle(perm.integrationId, key, perm[key])
                            }
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:focus:ring-offset-zinc-900 ${
                              perm[key]
                                ? 'bg-blue-600'
                                : 'bg-zinc-300 dark:bg-zinc-600'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                                perm[key] ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
