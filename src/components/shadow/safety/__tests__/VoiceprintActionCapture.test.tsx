/**
 * @jest-environment jsdom
 */

/**
 * Unit tests: VoiceprintActionCapture
 *
 * Verifies:
 *   - Renders nothing when open=false
 *   - Renders the modal with action description, prompt phrase, risk badge
 *   - Posts a multipart body to /api/shadow/voiceprint/verify on stop
 *   - Includes riskLevel in the multipart body
 *   - Calls onVerified with parsed confidence + antiSpoofPassed on success
 *   - Shows the spoof error and exposes a "Use PIN instead" button
 *   - Falls back via onFallback when the API errors
 *   - Escape key cancels via onCancel
 */

import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import VoiceprintActionCapture from '../VoiceprintActionCapture';

// ---------------------------------------------------------------------------
// MediaRecorder + getUserMedia mock
// ---------------------------------------------------------------------------

interface MockRecorder {
  start: jest.Mock;
  stop: jest.Mock;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  mimeType: string;
}

let lastRecorder: MockRecorder | null = null;

// Factory: returns a plain object that the production code can mutate
// (it sets `.ondataavailable` and `.onstop` directly on the instance).
// We expose the same object via `lastRecorder` so the test can drive it.
function createMockRecorder(target: Partial<MockRecorder>): MockRecorder {
  const recorder = target as MockRecorder;
  recorder.ondataavailable = null;
  recorder.onstop = null;
  recorder.mimeType = 'audio/webm';
  recorder.start = jest.fn(() => {
    // Push a chunk so the stop() Promise resolves with data.
    queueMicrotask(() => {
      recorder.ondataavailable?.({
        data: new Blob(['chunk'], { type: 'audio/webm' }),
      });
    });
  });
  recorder.stop = jest.fn(() => {
    queueMicrotask(() => recorder.onstop?.());
  });
  return recorder;
}

// Constructor function (avoids a `this` alias so eslint stays clean).
function MockMediaRecorderImpl(this: Partial<MockRecorder>) {
  lastRecorder = createMockRecorder(this);
}

const stopTrack = jest.fn();
const fakeStream = {
  getTracks: () => [{ stop: stopTrack }],
};

beforeAll(() => {
  // jsdom doesn't ship MediaRecorder or mediaDevices.
  (global as unknown as { MediaRecorder: unknown }).MediaRecorder =
    MockMediaRecorderImpl;

  Object.defineProperty(global.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: jest.fn(() => Promise.resolve(fakeStream)),
    },
  });
});

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<React.ComponentProps<typeof VoiceprintActionCapture>> = {}) {
  return {
    open: true,
    riskLevel: 'medium' as const,
    actionDescription: 'Confirm sending $5,000 to Acme Corp',
    onVerified: jest.fn(),
    onFallback: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockVerifyResponse(body: object, ok = true, status = 200) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
    }),
  ) as unknown as typeof fetch;
}

const originalFetch = global.fetch;

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
  lastRecorder = null;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoiceprintActionCapture', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<VoiceprintActionCapture {...makeProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with action description, prompt phrase and risk badge', () => {
    render(
      <VoiceprintActionCapture
        {...makeProps({ promptPhrase: 'Please say: alpha bravo' })}
      />,
    );
    expect(screen.getByTestId('voiceprint-action-capture-dialog')).toBeTruthy();
    expect(screen.getByText('Confirm sending $5,000 to Acme Corp')).toBeTruthy();
    expect(screen.getByTestId('voiceprint-action-prompt-phrase').textContent).toMatch(
      /alpha bravo/,
    );
    expect(screen.getByTestId('voiceprint-action-risk-badge').textContent).toMatch(
      /Medium risk/i,
    );
    // a11y: role=dialog with aria-modal
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('on stop, POSTs multipart to /api/shadow/voiceprint/verify with riskLevel and calls onVerified', async () => {
    mockVerifyResponse({
      success: true,
      data: {
        verified: true,
        method: 'voiceprint',
        confidence: 0.93,
        antiSpoofPassed: true,
      },
    });

    const onVerified = jest.fn();
    render(<VoiceprintActionCapture {...makeProps({ onVerified, riskLevel: 'high' })} />);

    fireEvent.click(screen.getByTestId('voiceprint-action-record-button'));

    // wait for recorder to be alive
    await waitFor(() => expect(lastRecorder).not.toBeNull());

    await act(async () => {
      fireEvent.click(await screen.findByTestId('voiceprint-action-stop-button'));
    });

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/shadow/voiceprint/verify');
    expect((init as { method: string }).method).toBe('POST');

    const body = (init as { body: FormData }).body;
    expect(body).toBeInstanceOf(FormData);
    // Multipart body carries audio + riskLevel.
    expect(body.get('audio')).not.toBeNull();
    expect(body.get('riskLevel')).toBe('high');

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledWith({
        confidence: 0.93,
        antiSpoofPassed: true,
      });
    });
  });

  it('shows spoof error and "Use PIN instead" button when antiSpoof fails', async () => {
    mockVerifyResponse({
      success: true,
      data: {
        verified: false,
        method: 'voiceprint_spoof_detected',
        confidence: 0,
        antiSpoofPassed: false,
      },
    });

    const onFallback = jest.fn();
    const onVerified = jest.fn();
    render(
      <VoiceprintActionCapture {...makeProps({ onFallback, onVerified })} />,
    );

    fireEvent.click(screen.getByTestId('voiceprint-action-record-button'));
    await waitFor(() => expect(lastRecorder).not.toBeNull());

    await act(async () => {
      fireEvent.click(await screen.findByTestId('voiceprint-action-stop-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('voiceprint-action-error')).toBeTruthy();
    });
    expect(onVerified).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('voiceprint-action-fallback-button'));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('falls back via onFallback when the API returns 500', async () => {
    mockVerifyResponse(
      { success: false, error: { message: 'voiceprint service down' } },
      false,
      500,
    );

    const onFallback = jest.fn();
    render(<VoiceprintActionCapture {...makeProps({ onFallback })} />);

    fireEvent.click(screen.getByTestId('voiceprint-action-record-button'));
    await waitFor(() => expect(lastRecorder).not.toBeNull());

    await act(async () => {
      fireEvent.click(await screen.findByTestId('voiceprint-action-stop-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('voiceprint-action-error').textContent).toMatch(
        /voiceprint service down/i,
      );
    });
    fireEvent.click(screen.getByTestId('voiceprint-action-fallback-button'));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('Escape key cancels via onCancel', () => {
    const onCancel = jest.fn();
    render(<VoiceprintActionCapture {...makeProps({ onCancel })} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
