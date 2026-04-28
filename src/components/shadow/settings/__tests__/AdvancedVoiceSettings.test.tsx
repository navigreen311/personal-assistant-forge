/**
 * @jest-environment jsdom
 */

/**
 * Unit tests: AdvancedVoiceSettings component.
 *
 * Renders with React Testing Library and asserts:
 *   - all configurable controls are present
 *   - toggles fire the expected onChange patches
 *   - selects fire the expected onChange patches
 *   - the voiceprint enrollment section is mounted
 *   - the service-status row renders an X when the health check fails
 *     (fail-closed behavior)
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import AdvancedVoiceSettings from '../AdvancedVoiceSettings';

// Stub fetch so the health check fails fast (fail-closed) and so any
// auto-PATCH calls we make in onChange-less mode don't actually hit a
// network. Each test sets its own fetch mock as needed.
const originalFetch = global.fetch;

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
});

beforeEach(() => {
  // Default: fetch always rejects (no VAF service in jsdom).
  global.fetch = jest.fn(() => Promise.reject(new Error('no network'))) as unknown as typeof fetch;
});

describe('AdvancedVoiceSettings — controls render', () => {
  it('renders the section header and Powered-By copy', () => {
    render(<AdvancedVoiceSettings onChange={() => {}} />);
    expect(screen.getByText('Advanced Voice Settings')).toBeTruthy();
    expect(screen.getByText('Powered by VisionAudioForge')).toBeTruthy();
  });

  it('renders all required controls when expanded (default)', () => {
    render(<AdvancedVoiceSettings onChange={() => {}} />);

    // Provider selects
    expect(screen.getByLabelText('Speech Recognition Provider')).toBeTruthy();
    expect(screen.getByLabelText('Voice Synthesis Provider')).toBeTruthy();

    // Toggles
    expect(screen.getByRole('switch', { name: 'Audio Enhancement' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Auto-detect Language' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Call Sentiment Analysis' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Meeting Intelligence' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Document Analysis' })).toBeTruthy();
  });

  it('mounts the voiceprint enrollment section', () => {
    render(<AdvancedVoiceSettings onChange={() => {}} />);
    expect(screen.getByText(/Voiceprint Verification/i)).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Use voiceprint for auth/i })).toBeTruthy();
  });

  it('starts collapsed when defaultCollapsed is true', () => {
    render(<AdvancedVoiceSettings onChange={() => {}} defaultCollapsed />);
    // With collapsed body, the provider select should not be in the DOM.
    expect(screen.queryByLabelText('Speech Recognition Provider')).toBeNull();
    // Header still present.
    expect(screen.getByText('Advanced Voice Settings')).toBeTruthy();
  });

  it('shows the sentiment threshold dropdown only when sentiment is enabled', () => {
    const { rerender } = render(
      <AdvancedVoiceSettings
        onChange={() => {}}
        initialConfig={{ sentimentOnVoiceforgeCalls: false }}
      />
    );
    expect(screen.queryByLabelText(/Alert threshold/i)).toBeNull();

    rerender(
      <AdvancedVoiceSettings
        onChange={() => {}}
        initialConfig={{ sentimentOnVoiceforgeCalls: true }}
      />
    );
    expect(screen.getByLabelText(/Alert threshold/i)).toBeTruthy();
  });

  it('shows the auto-create-tasks checkbox only when meeting intelligence is on', () => {
    const { rerender } = render(
      <AdvancedVoiceSettings
        onChange={() => {}}
        initialConfig={{ autoProcessMeetings: false }}
      />
    );
    expect(screen.queryByLabelText('Auto-create tasks from action items')).toBeNull();

    rerender(
      <AdvancedVoiceSettings
        onChange={() => {}}
        initialConfig={{ autoProcessMeetings: true }}
      />
    );
    expect(screen.getByLabelText('Auto-create tasks from action items')).toBeTruthy();
  });
});

describe('AdvancedVoiceSettings — onChange wiring', () => {
  it('fires onChange with audioEnhancement patch when toggled', () => {
    const onChange = jest.fn();
    render(
      <AdvancedVoiceSettings
        onChange={onChange}
        initialConfig={{ audioEnhancement: true }}
      />
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Audio Enhancement' }));
    expect(onChange).toHaveBeenCalledWith({ audioEnhancement: false });
  });

  it('fires onChange with sttProvider patch when select changes', () => {
    const onChange = jest.fn();
    render(<AdvancedVoiceSettings onChange={onChange} />);

    const select = screen.getByLabelText('Speech Recognition Provider') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'whisper' } });
    expect(onChange).toHaveBeenCalledWith({ sttProvider: 'whisper' });
  });

  it('fires onChange with ttsProvider patch when select changes', () => {
    const onChange = jest.fn();
    render(<AdvancedVoiceSettings onChange={onChange} />);

    const select = screen.getByLabelText('Voice Synthesis Provider') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'google' } });
    expect(onChange).toHaveBeenCalledWith({ ttsProvider: 'google' });
  });

  it('fires onChange with sentimentAlertThreshold patch when threshold changes', () => {
    const onChange = jest.fn();
    render(
      <AdvancedVoiceSettings
        onChange={onChange}
        initialConfig={{ sentimentOnVoiceforgeCalls: true, sentimentAlertThreshold: 0.8 }}
      />
    );

    const select = screen.getByLabelText(/Alert threshold/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '0.9' } });
    expect(onChange).toHaveBeenCalledWith({ sentimentAlertThreshold: 0.9 });
  });

  it('fires onChange with autoCreateTasks when sub-checkbox toggled', () => {
    const onChange = jest.fn();
    render(
      <AdvancedVoiceSettings
        onChange={onChange}
        initialConfig={{ autoProcessMeetings: true, autoCreateTasks: true }}
      />
    );

    fireEvent.click(screen.getByLabelText('Auto-create tasks from action items'));
    expect(onChange).toHaveBeenCalledWith({ autoCreateTasks: false });
  });

  it('collapse toggle hides body without calling onChange', () => {
    const onChange = jest.fn();
    render(<AdvancedVoiceSettings onChange={onChange} />);

    const header = screen.getByRole('button', { name: /Advanced Voice Settings/i });
    fireEvent.click(header);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Speech Recognition Provider')).toBeNull();
  });
});

describe('AdvancedVoiceSettings — service status', () => {
  it('renders an X icon when the VAF health check fails (fail-closed)', async () => {
    // fetch already rejects per beforeEach.
    render(<AdvancedVoiceSettings onChange={() => {}} vafServiceUrl="http://vaf.test" />);

    const status = await screen.findByTestId('vaf-service-status');
    await waitFor(() => {
      expect(status.textContent).toMatch(/❌/);
    });
  });

  it('renders a checkmark when the health endpoint returns 200', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            latency: { stt: 320, tts: 180, sentiment: 50 },
          }),
      })
    ) as unknown as typeof fetch;

    render(<AdvancedVoiceSettings onChange={() => {}} vafServiceUrl="http://vaf.test" />);

    const status = await screen.findByTestId('vaf-service-status');
    await waitFor(() => {
      expect(status.textContent).toMatch(/✅/);
      expect(status.textContent).toMatch(/VisionAudioForge connected/);
    });
  });
});

describe('AdvancedVoiceSettings — self-persist when no onChange', () => {
  it('PATCHes /api/shadow/vaf-config when onChange prop is omitted', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<AdvancedVoiceSettings />);

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Audio Enhancement' }));
    });

    // First call may be the health check; find the PATCH call specifically.
    const calls = (fetchMock as jest.Mock).mock.calls;
    const patchCall = calls.find(
      (c) => typeof c[1] === 'object' && (c[1] as { method?: string }).method === 'PATCH'
    );
    expect(patchCall).toBeTruthy();
    expect(patchCall![0]).toBe('/api/shadow/vaf-config');
  });
});
