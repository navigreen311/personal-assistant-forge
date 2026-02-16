'use client';

import { useState, useCallback, useEffect } from 'react';
import RoutingRuleEditor from '@/modules/capture/components/RoutingRuleEditor';
import type { RoutingRule } from '@/modules/capture/types';

export default function RulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);

  // Load rules on mount
  useEffect(() => {
    async function loadRules() {
      try {
        const response = await fetch('/api/capture/rules');
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setRules(result.data);
          }
        }
      } catch {
        // Error handling would show a toast in production
      }
    }
    loadRules();
  }, []);

  const handleSave = useCallback(
    async (rule: Omit<RoutingRule, 'id'>) => {
      try {
        const response = await fetch('/api/capture/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rule),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setRules((prev) => [...prev, result.data]);
          }
        }
      } catch {
        // Error handling
      }
    },
    [],
  );

  const handleUpdate = useCallback(
    async (id: string, updates: Partial<RoutingRule>) => {
      try {
        const response = await fetch('/api/capture/rules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...updates }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setRules((prev) => prev.map((r) => (r.id === id ? result.data : r)));
          }
        }
      } catch {
        // Error handling
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const response = await fetch('/api/capture/rules', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });

        if (response.ok) {
          setRules((prev) => prev.filter((r) => r.id !== id));
        }
      } catch {
        // Error handling
      }
    },
    [],
  );

  const handleReorder = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setRules((prev) => {
        const sorted = [...prev].sort((a, b) => b.priority - a.priority);
        const index = sorted.findIndex((r) => r.id === id);
        if (index === -1) return prev;

        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= sorted.length) return prev;

        // Swap priorities
        const tempPriority = sorted[index].priority;
        sorted[index] = { ...sorted[index], priority: sorted[swapIndex].priority };
        sorted[swapIndex] = { ...sorted[swapIndex], priority: tempPriority };

        return sorted;
      });
    },
    [],
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Routing Rules</h2>
        <p className="text-sm text-gray-500">
          Configure how captured items are automatically routed to the right
          destination. Rules are evaluated in priority order; the first match
          wins.
        </p>
      </div>

      <RoutingRuleEditor
        rules={rules.sort((a, b) => b.priority - a.priority)}
        onSave={handleSave}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onReorder={handleReorder}
      />
    </div>
  );
}
