/**
 * @jest-environment jsdom
 */

/**
 * Unit test: SettingsVoicePhone renders the AdvancedVoiceSettings
 * (Powered by VisionAudioForge) section.
 *
 * The wider SettingsVoicePhone form is exercised by integration tests;
 * this file focuses narrowly on WS06's mount-point requirement so the
 * Advanced Voice Settings panel cannot regress out of the live UI.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import SettingsVoicePhone from '../SettingsVoicePhone';

// Stub fetch so the AdvancedVoiceSettings health-check ping doesn't
// blow up in jsdom — fail-closed is fine for this assertion.
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.reject(new Error('no network'))) as unknown as typeof fetch;
});

afterEach(() => {
  jest.clearAllMocks();
  global.fetch = originalFetch;
});

describe('SettingsVoicePhone — Advanced Voice Settings mount', () => {
  it('renders the AdvancedVoiceSettings section inside the panel', async () => {
    await act(async () => {
      render(<SettingsVoicePhone onSave={jest.fn(async () => undefined)} />);
    });

    // The component is rendered. Even when collapsed by default, the
    // section header / data-testid are still in the DOM.
    expect(screen.getByTestId('advanced-voice-settings')).toBeTruthy();
    expect(screen.getByText('Advanced Voice Settings')).toBeTruthy();
    expect(screen.getByText('Powered by VisionAudioForge')).toBeTruthy();
  });

  it('renders the existing Voice Settings section alongside the new VAF section', async () => {
    await act(async () => {
      render(<SettingsVoicePhone onSave={jest.fn(async () => undefined)} />);
    });

    // Sanity check — the VAF mount didn't accidentally replace the
    // existing voice settings panel.
    expect(screen.getByText('Voice Settings')).toBeTruthy();
    expect(screen.getByTestId('advanced-voice-settings')).toBeTruthy();
  });
});
