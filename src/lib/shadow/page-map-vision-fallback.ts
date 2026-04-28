// Page-map vision fallback.
//
// When Shadow tries to find a UI element via the registered page-map
// selector chain and that fails, this helper takes a screenshot of the
// document and asks VAF Vision to locate the element by its label.
//
// `html2canvas` is loaded via dynamic import so it stays out of the main
// JS bundle for users who never trigger the fallback path.

import { VAFVision, type ScreenAnalysisResult } from '@/lib/vaf/vision-client';

export interface VisionFallbackResult {
  found: boolean;
  method: 'css_selector' | 'vision' | 'none';
  selector?: string;
  matched?: ScreenAnalysisResult['elements'][number];
}

// Try to resolve the element via the page's CSS selector chain. Returns
// the matching Element or null. Kept simple — the real page-map system
// has its own helper; this is the local probe used before we fall back
// to vision.
export function findElement(selector: string): Element | null {
  if (typeof document === 'undefined') return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

// Convert a canvas to a PNG Buffer so we can ship it to VAF Vision.
async function canvasToBuffer(canvas: HTMLCanvasElement): Promise<Buffer> {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) throw new Error('canvas.toBlob returned null');
  // Prefer Blob.arrayBuffer() (modern), fall back to FileReader for older
  // environments and certain test runners (jsdom < 22).
  if (typeof blob.arrayBuffer === 'function') {
    return Buffer.from(await blob.arrayBuffer());
  }
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return Buffer.from(arrayBuffer);
}

export async function findElementWithVisionFallback(
  selector: string,
  fallbackLabel: string,
  vision: VAFVision = new VAFVision()
): Promise<VisionFallbackResult> {
  // 1. Fast path: the selector still resolves on the live DOM.
  const el = findElement(selector);
  if (el) {
    return { found: true, method: 'css_selector', selector };
  }

  // 2. Vision fallback. Lazy-import html2canvas so it's not in the main
  //    bundle for users who never hit this path.
  if (typeof document === 'undefined') {
    return { found: false, method: 'none' };
  }

  try {
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default ?? html2canvasModule;
    const canvas = (await (html2canvas as (
      element: HTMLElement
    ) => Promise<HTMLCanvasElement>)(document.body)) as HTMLCanvasElement;
    const screenshot = await canvasToBuffer(canvas);
    const analysis = await vision.analyzeScreen(screenshot);

    const target = fallbackLabel.toLowerCase();
    const match = analysis.elements.find((e) =>
      e.label.toLowerCase().includes(target)
    );

    if (match) {
      return {
        found: true,
        method: 'vision',
        selector: `[data-testid="${match.label}"]`,
        matched: match,
      };
    }
  } catch (err) {
    // Surface the failure in the dev console but don't break the caller.
    console.warn('[Shadow] Vision fallback failed:', err);
  }

  return { found: false, method: 'none' };
}
