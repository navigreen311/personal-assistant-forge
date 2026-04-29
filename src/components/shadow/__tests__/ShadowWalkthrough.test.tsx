/**
 * @jest-environment jsdom
 */

/**
 * RTL tests: ShadowWalkthrough wires resolveElementWithFallback.
 *
 * Verifies:
 *   1. CSS-only path: when the selector resolves, vision is never asked.
 *   2. Vision-fallback path: when CSS misses but the user has opted in
 *      via screenVisionFallbackEnabled, the resolver consults VAF Vision
 *      and the synthetic selector it returns is used to position the
 *      walkthrough spotlight.
 *   3. Default-off: with the flag absent / false, a stale selector
 *      yields the "Target element not found" fallback UI and vision is
 *      never invoked (zero-cost for users who haven't opted in).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ShadowWalkthrough } from '../ShadowWalkthrough';

jest.mock('@/lib/shadow/element-resolver', () => ({
  resolveElementWithFallback: jest.fn(),
}));

import { resolveElementWithFallback } from '@/lib/shadow/element-resolver';

const mockedResolve = resolveElementWithFallback as jest.MockedFunction<
  typeof resolveElementWithFallback
>;

beforeEach(() => {
  document.body.innerHTML = '';
  mockedResolve.mockReset();
});

const baseProps = {
  instruction: 'Click here to save your work',
  stepNumber: 1,
  totalSteps: 3,
  onNext: jest.fn(),
  onSkip: jest.fn(),
  onDoItForMe: jest.fn(),
};

describe('ShadowWalkthrough — element resolution', () => {
  it('resolves via CSS when the selector is fresh', async () => {
    const target = document.createElement('button');
    target.setAttribute('data-testid', 'save');
    target.textContent = 'Save';
    document.body.appendChild(target);

    mockedResolve.mockResolvedValue({
      found: true,
      method: 'css',
      element: target,
    });

    render(
      <ShadowWalkthrough
        {...baseProps}
        targetSelector='[data-testid="save"]'
        fallbackLabel="Save"
        screenVisionFallbackEnabled={false}
      />,
    );

    await waitFor(() => expect(mockedResolve).toHaveBeenCalledTimes(1));
    expect(mockedResolve).toHaveBeenCalledWith(
      '[data-testid="save"]',
      'Save',
      { screenVisionFallback: false },
    );

    // CSS hit means we have a target rect, so the "not found" fallback
    // UI must NOT be visible.
    await waitFor(() => {
      expect(screen.queryByText(/Target element not found/i)).toBeNull();
    });
  });

  it('uses the vision-returned selector when CSS misses and the flag is on', async () => {
    // Build a real element that the synthetic selector will resolve to
    // — this simulates the case where Vision finds the element by label
    // and the page actually has a matching data-testid.
    const real = document.createElement('div');
    real.setAttribute('data-testid', 'Submit Application');
    real.textContent = 'Submit Application';
    document.body.appendChild(real);

    mockedResolve.mockResolvedValue({
      found: true,
      method: 'vision',
      selector: '[data-testid="Submit Application"]',
    });

    render(
      <ShadowWalkthrough
        {...baseProps}
        targetSelector='[data-testid="stale-selector"]'
        fallbackLabel="Submit Application"
        screenVisionFallbackEnabled={true}
      />,
    );

    await waitFor(() => expect(mockedResolve).toHaveBeenCalledTimes(1));
    expect(mockedResolve).toHaveBeenCalledWith(
      '[data-testid="stale-selector"]',
      'Submit Application',
      { screenVisionFallback: true },
    );

    // Vision found the element, so the "not found" fallback should NOT
    // be displayed.
    await waitFor(() => {
      expect(screen.queryByText(/Target element not found/i)).toBeNull();
    });
  });

  it('shows the "not found" fallback when the resolver reports none', async () => {
    mockedResolve.mockResolvedValue({ found: false, method: 'none' });

    render(
      <ShadowWalkthrough
        {...baseProps}
        targetSelector='[data-testid="missing"]'
        fallbackLabel="Save"
        screenVisionFallbackEnabled={false}
      />,
    );

    await waitFor(() => expect(mockedResolve).toHaveBeenCalledTimes(1));
    // Gating is respected: the false flag is forwarded to the resolver.
    expect(mockedResolve).toHaveBeenCalledWith(
      '[data-testid="missing"]',
      'Save',
      { screenVisionFallback: false },
    );

    // The fallback message should appear.
    await waitFor(() => {
      expect(screen.getByText(/Target element not found/i)).toBeTruthy();
    });
  });

  it('uses instruction as the fallbackLabel when fallbackLabel is omitted', async () => {
    mockedResolve.mockResolvedValue({ found: false, method: 'none' });

    render(
      <ShadowWalkthrough
        {...baseProps}
        targetSelector='[data-testid="x"]'
      />,
    );

    await waitFor(() => expect(mockedResolve).toHaveBeenCalledTimes(1));
    expect(mockedResolve).toHaveBeenCalledWith(
      '[data-testid="x"]',
      baseProps.instruction,
      { screenVisionFallback: false },
    );
  });
});
