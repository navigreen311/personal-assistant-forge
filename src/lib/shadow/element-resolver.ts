// Element resolver: CSS-first, vision-fallback element lookup.
//
// Shadow needs to point users at on-screen elements (highlight,
// scroll-into-view, walkthrough spotlight). Selectors in the page-map
// registry can go stale across UI churn, so this resolver tries the
// CSS path first and, if `screenVisionFallback` is enabled in the
// user's VAF config, asks VAF Vision to locate the element by its
// human label as a fallback.
//
// Vision is *opt-in* per user config (`vafConfig.screenVisionFallback`,
// default false). The flag must be passed in by the caller — this
// module is environment-agnostic so it can run from a client component
// (where `getVafConfig` cannot be awaited synchronously) or wherever
// the resolved flag has already been threaded through.

import { findElementWithVisionFallback } from './page-map-vision-fallback';
import type { VAFVision } from '@/lib/vaf/vision-client';

export type ResolveElementResult =
  | { found: true; method: 'css'; element: Element }
  | { found: true; method: 'vision'; selector: string }
  | { found: false; method: 'none' };

export interface ResolveElementOptions {
  /**
   * When false (default), only the CSS selector is tried and a
   * vision fallback is never attempted, even if the selector misses.
   * Wire this from `vafConfig.screenVisionFallback`.
   */
  screenVisionFallback?: boolean;
  /**
   * Optional injected VAFVision instance. Mostly used by tests and by
   * server-side callers that want to share a single client.
   */
  vision?: VAFVision;
}

/**
 * Resolve a UI element by selector, falling back to VAF Vision when
 * permitted by user config and the selector misses.
 *
 * @param selector       CSS selector chain registered in the page map.
 * @param fallbackLabel  Human-readable label for the element (used by
 *                       VAF Vision to locate it from a screenshot).
 * @param opts           Optional flags. `screenVisionFallback` must be
 *                       true for the vision path to run.
 */
export async function resolveElementWithFallback(
  selector: string,
  fallbackLabel: string,
  opts: ResolveElementOptions = {},
): Promise<ResolveElementResult> {
  // 1. CSS-selector fast path. Safe in non-DOM environments — returns
  //    null if document is unavailable.
  if (typeof document !== 'undefined') {
    let el: Element | null = null;
    try {
      el = document.querySelector(selector);
    } catch {
      el = null;
    }
    if (el) {
      return { found: true, method: 'css', element: el };
    }
  }

  // 2. Vision fallback — only when the user has opted in.
  if (!opts.screenVisionFallback) {
    return { found: false, method: 'none' };
  }

  const vision = opts.vision
    ? await findElementWithVisionFallback(selector, fallbackLabel, opts.vision)
    : await findElementWithVisionFallback(selector, fallbackLabel);

  if (vision.found && vision.method === 'vision' && vision.selector) {
    return { found: true, method: 'vision', selector: vision.selector };
  }

  return { found: false, method: 'none' };
}
