'use client';

import { useEffect, useState, useCallback } from 'react';
import type { PermissionSet } from '../types';

interface PermissionsDashboardProps {
  userId: string;
}

type PermissionKey = 'read' | 'draft' | 'execute';

export { PermissionsDashboard };

export default function PermissionsDashboard({ userId }: PermissionsDashboardProps) {
  const [permissions, setPermissions] = useState<PermissionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
        <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
          Loading permissions...
        </span>
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

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Integration Permissions
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {permissions.map((perm) => (
          <div
            key={perm.integrationId}
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {perm.integrationName}
            </h3>

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
        ))}
      </div>
    </div>
  );
}
