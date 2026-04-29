'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { resolveElementWithFallback } from '@/lib/shadow/element-resolver';

interface ShadowWalkthroughProps {
  targetSelector: string;
  instruction: string;
  stepNumber: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  onDoItForMe: () => void;
  /**
   * Human-readable label for the target element. Used as the fallback
   * descriptor sent to VAF Vision when `targetSelector` no longer
   * resolves. Falls back to `instruction` if not provided.
   */
  fallbackLabel?: string;
  /**
   * Mirrors `vafConfig.screenVisionFallback`. When true, a stale
   * selector triggers a vision-based screen analysis to locate the
   * target element. Default false (per VAF default config).
   */
  screenVisionFallbackEnabled?: boolean;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function ShadowWalkthrough({
  targetSelector,
  instruction,
  stepNumber,
  totalSteps,
  onNext,
  onSkip,
  onDoItForMe,
  fallbackLabel,
  screenVisionFallbackEnabled = false,
}: ShadowWalkthroughProps) {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'bottom' | 'top'>('bottom');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Synchronous CSS-only rect lookup for the live scroll/resize listeners.
  // Vision fallback is intentionally NOT in this hot path — it's async,
  // costs a screenshot + network round-trip, and only needs to run once
  // when the selector is initially stale.
  const updateRectFromElement = useCallback((element: Element | null) => {
    if (!element) {
      setTargetRect(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    const spaceBelow = window.innerHeight - rect.bottom;
    setTooltipPosition(spaceBelow > 200 ? 'bottom' : 'top');
  }, []);

  const updateTargetRect = useCallback(() => {
    updateRectFromElement(document.querySelector(targetSelector));
  }, [targetSelector, updateRectFromElement]);

  // Initial resolution: try CSS, then (if enabled) ask Vision.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await resolveElementWithFallback(
        targetSelector,
        fallbackLabel ?? instruction,
        { screenVisionFallback: screenVisionFallbackEnabled },
      );
      if (cancelled) return;

      if (result.found && result.method === 'css') {
        updateRectFromElement(result.element);
      } else if (result.found && result.method === 'vision') {
        // Vision returned a synthetic selector; try to resolve it on
        // the live DOM. If it doesn't resolve we leave targetRect null
        // and the "Target element not found" fallback UI renders.
        updateRectFromElement(document.querySelector(result.selector));
      } else {
        setTargetRect(null);
      }
    })();

    // Recalculate on scroll/resize using the cheap CSS-only path.
    window.addEventListener('scroll', updateTargetRect, true);
    window.addEventListener('resize', updateTargetRect);

    return () => {
      cancelled = true;
      window.removeEventListener('scroll', updateTargetRect, true);
      window.removeEventListener('resize', updateTargetRect);
    };
  }, [
    targetSelector,
    fallbackLabel,
    instruction,
    screenVisionFallbackEnabled,
    updateRectFromElement,
    updateTargetRect,
  ]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSkip]);

  const padding = 8; // padding around the spotlight cutout

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[60]" aria-modal="true" role="dialog">
      {/* Semi-transparent overlay with spotlight cutout using CSS clip-path */}
      <div
        className="absolute inset-0 bg-black/50"
        style={
          targetRect
            ? {
                clipPath: `polygon(
                  0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
                  ${targetRect.left - padding}px ${targetRect.top - padding}px,
                  ${targetRect.left - padding}px ${targetRect.top + targetRect.height + padding}px,
                  ${targetRect.left + targetRect.width + padding}px ${targetRect.top + targetRect.height + padding}px,
                  ${targetRect.left + targetRect.width + padding}px ${targetRect.top - padding}px,
                  ${targetRect.left - padding}px ${targetRect.top - padding}px
                )`,
              }
            : undefined
        }
      />

      {/* Pulsing border ring around target */}
      {targetRect && (
        <div
          className="absolute ring-2 ring-blue-500 animate-pulse rounded-md pointer-events-none"
          style={{
            top: targetRect.top - padding,
            left: targetRect.left - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
          }}
        />
      )}

      {/* Tooltip */}
      {targetRect && (
        <div
          className="absolute z-[61] w-80"
          style={
            tooltipPosition === 'bottom'
              ? {
                  top: targetRect.top + targetRect.height + padding + 12,
                  left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 336)),
                }
              : {
                  bottom: window.innerHeight - targetRect.top + padding + 12,
                  left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 336)),
                }
          }
        >
          {/* Arrow pointing to element */}
          <div
            className={`absolute w-3 h-3 bg-white dark:bg-gray-800 rotate-45 ${
              tooltipPosition === 'bottom'
                ? '-top-1.5 left-8'
                : '-bottom-1.5 left-8'
            }`}
          />

          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
            {/* Step indicator */}
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
              Step {stepNumber} of {totalSteps}
            </div>

            {/* Progress dots */}
            <div className="flex gap-1 mb-3">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${
                    i < stepNumber
                      ? 'bg-blue-500'
                      : i === stepNumber
                        ? 'bg-blue-300'
                        : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>

            {/* Instruction text */}
            <p className="text-sm text-gray-900 dark:text-white mb-4 leading-relaxed">
              {instruction}
            </p>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={onNext}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
              >
                {stepNumber === totalSteps ? 'Finish' : 'Next'}
              </button>
              <button
                onClick={onSkip}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
              >
                Skip
              </button>
              <button
                onClick={onDoItForMe}
                className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors focus:outline-none"
              >
                Do it for me
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback when target not found */}
      {!targetRect && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm mx-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
              Step {stepNumber} of {totalSteps}
            </div>
            <p className="text-sm text-gray-900 dark:text-white mb-4">
              {instruction}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
              Target element not found on this page.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onNext}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {stepNumber === totalSteps ? 'Finish' : 'Next'}
              </button>
              <button
                onClick={onSkip}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
