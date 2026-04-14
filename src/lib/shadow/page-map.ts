// Runtime registry of page-level metadata that Shadow can consult.
// Pages call `registerPage` in a `useEffect` (see `useShadowPageMap`) to
// describe the objects and actions they expose. The chat widget can ship
// the current page map alongside a message so the agent knows what the
// user is looking at without re-fetching it server-side.

export interface VisibleObject {
  id: string;
  type: string;
  label: string;
  status?: string;
  priority?: string;
  selector: string;
  deepLink: string;
}

export type ConfirmationLevel =
  | 'none'
  | 'tap'
  | 'confirm_phrase'
  | 'voice_pin';

export type BlastRadius = 'self' | 'entity' | 'external' | 'public';

export interface PageAction {
  id: string;
  label: string;
  voiceTriggers: string[];
  requiredFields?: string[];
  confirmationLevel: ConfirmationLevel;
  reversible: boolean;
  blastRadius: BlastRadius;
}

export interface PageMap {
  pageId: string;
  title: string;
  description: string;
  visibleObjects: VisibleObject[];
  availableActions: PageAction[];
  activeFilters: Record<string, string>;
  activeEntity: string | null;
}

const pageMapRegistry = new Map<string, PageMap>();

export function registerPage(pageMap: PageMap): void {
  pageMapRegistry.set(pageMap.pageId, pageMap);
}

export function unregisterPage(pageId: string): void {
  pageMapRegistry.delete(pageId);
}

export function getRegisteredPages(): string[] {
  return Array.from(pageMapRegistry.keys());
}

export function getPageMap(pageId: string): PageMap | undefined {
  return pageMapRegistry.get(pageId);
}

export function getCurrentPageMap(): PageMap | null {
  // Most recently registered page wins. The hook re-registers on mount,
  // so this reflects the currently mounted page.
  const entries = Array.from(pageMapRegistry.entries());
  return entries.length > 0 ? entries[entries.length - 1][1] : null;
}
