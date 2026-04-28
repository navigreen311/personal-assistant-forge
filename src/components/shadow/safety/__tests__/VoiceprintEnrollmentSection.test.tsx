/**
 * @jest-environment jsdom
 */

/**
 * Unit tests: VoiceprintEnrollmentSection — GDPR delete flow.
 *
 * Verifies that the "Delete voiceprint data" button:
 *   1. is only shown when the user is enrolled
 *   2. shows a confirmation dialog before firing
 *   3. calls DELETE /api/shadow/voiceprint/delete
 *   4. updates local enrollment state + invokes onEnrollmentChange(false)
 *   5. does nothing when the user cancels the confirm dialog
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VoiceprintEnrollmentSection from '../VoiceprintEnrollmentSection';

const originalFetch = global.fetch;
const originalConfirm = global.confirm;

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
  global.confirm = originalConfirm;
});

describe('VoiceprintEnrollmentSection — GDPR delete', () => {
  it('does not render the delete button when not enrolled', () => {
    render(<VoiceprintEnrollmentSection initialEnrolled={false} />);
    expect(screen.queryByTestId('voiceprint-delete-button')).toBeNull();
  });

  it('renders the delete button when enrolled', () => {
    render(<VoiceprintEnrollmentSection initialEnrolled />);
    expect(screen.getByTestId('voiceprint-delete-button')).toBeTruthy();
  });

  it('calls DELETE /api/shadow/voiceprint/delete and updates state on confirm', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    // User confirms the dialog.
    global.confirm = jest.fn(() => true);

    const onEnrollmentChange = jest.fn();
    render(
      <VoiceprintEnrollmentSection
        initialEnrolled
        onEnrollmentChange={onEnrollmentChange}
      />,
    );

    fireEvent.click(screen.getByTestId('voiceprint-delete-button'));

    // Confirm dialog was consulted.
    expect(global.confirm).toHaveBeenCalledTimes(1);
    expect((global.confirm as jest.Mock).mock.calls[0][0]).toMatch(
      /Permanently delete your voiceprint/i,
    );

    // Fetch fired with DELETE.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (fetchMock as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/shadow/voiceprint/delete');
    expect((init as { method?: string }).method).toBe('DELETE');

    // Parent informed and the badge flipped to "Not Enrolled".
    await waitFor(() => {
      expect(onEnrollmentChange).toHaveBeenCalledWith(false);
    });
    expect(screen.getByText('Not Enrolled')).toBeTruthy();
  });

  it('does nothing when the user cancels the confirm dialog', () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;
    global.confirm = jest.fn(() => false);

    const onEnrollmentChange = jest.fn();
    render(
      <VoiceprintEnrollmentSection
        initialEnrolled
        onEnrollmentChange={onEnrollmentChange}
      />,
    );

    fireEvent.click(screen.getByTestId('voiceprint-delete-button'));

    expect(global.confirm).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onEnrollmentChange).not.toHaveBeenCalled();
    // Still enrolled.
    expect(screen.getByText('Enrolled')).toBeTruthy();
  });

  it('surfaces an error message when the delete request fails', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({ error: { message: 'voiceprint delete unavailable' } }),
      }),
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;
    global.confirm = jest.fn(() => true);

    render(<VoiceprintEnrollmentSection initialEnrolled />);

    fireEvent.click(screen.getByTestId('voiceprint-delete-button'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(
        /voiceprint delete unavailable/i,
      );
    });
    // Still enrolled (rollback on error).
    expect(screen.getByText('Enrolled')).toBeTruthy();
  });
});
