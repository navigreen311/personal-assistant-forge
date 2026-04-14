'use client';

import { useEffect } from 'react';
import { registerPage, unregisterPage, type PageMap } from '@/lib/shadow/page-map';

/**
 * Register a page's Shadow page-map while the component is mounted.
 *
 * Pass a new object each render — the hook's dep array detects changes via
 * the serialized visibleObjects list so the registry stays in sync with
 * what the user actually sees.
 */
export function useShadowPageMap(pageMap: PageMap): void {
  const objectsKey = JSON.stringify(pageMap.visibleObjects);

  useEffect(() => {
    registerPage(pageMap);
    return () => unregisterPage(pageMap.pageId);
    // We intentionally depend on stable keys rather than the full object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMap.pageId, objectsKey]);
}
