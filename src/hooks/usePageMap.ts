'use client';

import { useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageAction {
  id: string;
  label: string;
  handler: () => void | Promise<void>;
}

export interface PageMapRegistration {
  /** Unique page identifier (e.g. "invoices-list", "task-detail") */
  pageId: string;
  /** Human-readable page title for Shadow context */
  pageTitle: string;
  /** Actions that Shadow can trigger on this page */
  actions?: PageAction[];
  /** Selectable elements on the page (for walkthrough highlighting) */
  selectors?: Record<string, string>;
  /** Current page context data Shadow can reference */
  contextData?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Global registry (module-level singleton)
// ---------------------------------------------------------------------------

type PageRegistryEntry = PageMapRegistration & { mountedAt: number };

const pageRegistry = new Map<string, PageRegistryEntry>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

/** Get all currently registered pages (for external consumers) */
export function getRegisteredPages(): PageMapRegistration[] {
  return Array.from(pageRegistry.values());
}

/** Find a registered action by ID across all pages */
export function findAction(actionId: string): PageAction | null {
  for (const entry of pageRegistry.values()) {
    const action = entry.actions?.find((a) => a.id === actionId);
    if (action) return action;
  }
  return null;
}

/** Subscribe to registry changes */
export function subscribeToPageMap(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePageMap(registration: PageMapRegistration) {
  const registrationRef = useRef(registration);
  registrationRef.current = registration;

  // Register on mount, unregister on unmount
  useEffect(() => {
    const reg = registrationRef.current;
    pageRegistry.set(reg.pageId, {
      ...reg,
      mountedAt: Date.now(),
    });
    notifyListeners();

    return () => {
      pageRegistry.delete(reg.pageId);
      notifyListeners();
    };
  }, [registration.pageId]);

  // Update registration when it changes
  useEffect(() => {
    const existing = pageRegistry.get(registration.pageId);
    if (existing) {
      pageRegistry.set(registration.pageId, {
        ...registration,
        mountedAt: existing.mountedAt,
      });
      notifyListeners();
    }
  }, [registration]);

  // Trigger a specific action by ID
  const triggerAction = useCallback(
    async (actionId: string) => {
      const reg = registrationRef.current;
      const action = reg.actions?.find((a) => a.id === actionId);
      if (action) {
        await action.handler();
      } else {
        console.warn(`[usePageMap] Action "${actionId}" not found on page "${reg.pageId}"`);
      }
    },
    [],
  );

  return { triggerAction };
}
