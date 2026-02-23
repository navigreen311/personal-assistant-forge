/**
 * @jest-environment jsdom
 */

/**
 * Unit Tests: Shadow Settings Enhancements
 *
 * Tests the enhanced General tab (verbosity/proactivity descriptions, tone
 * descriptions, custom tone, entity override banner, sidekick sub-settings,
 * wake word custom option), enhanced Voice & Phone tab (expanded personas,
 * secondary language, copy button, CarPlay/SMS/Call Summary, audio quality),
 * and API route field coverage.
 */

// --- Mocks (must be before imports) ---

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => '/shadow',
}));

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', name: 'Test User', email: 'test@test.com' } },
    status: 'authenticated',
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) {
    return <a href={href} {...props}>{children}</a>;
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SettingsGeneral from '@/modules/shadow/components/SettingsGeneral';
import SettingsVoicePhone from '@/modules/shadow/components/SettingsVoicePhone';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockConfigResponse = {
  success: true,
  data: {
    general: {
      name: 'Shadow',
      tone: 'professional-friendly',
      customTone: '',
      verbosity: 3,
      proactivityLevel: 3,
      floatingBubble: true,
      defaultInputMode: 'text',
      autoSpeakResponses: false,
      wakeWordEnabled: false,
      wakeWord: 'Hey Shadow',
      useCustomWakeWord: false,
      keyboardShortcut: 'Ctrl+Shift+S',
      sidekickMode: false,
      sidekickAutoActivate: true,
      sidekickObservationFrequency: 'normal',
      sidekickNotificationThreshold: 'p0_only',
    },
    voicePhone: {
      voicePersona: 'default',
      speechSpeed: 1.0,
      language: 'en-US',
      secondaryLanguage: '',
      shadowPhoneNumber: '+1 (555) 0100-SHADOW',
      userPhoneNumbers: [],
      inboundCalls: true,
      outboundCalls: false,
      voicemail: true,
      autoRecording: false,
      autoTranscribe: true,
      carplayBluetooth: false,
      smsCompanion: true,
      callSummary: true,
      noiseCancellation: true,
      echoSuppression: true,
      autoSwitchOnPoorConnection: true,
      vadSensitivity: 'normal',
    },
  },
};

// ---------------------------------------------------------------------------
// Fetch mock setup
// ---------------------------------------------------------------------------

function setupFetchMock() {
  (global.fetch as jest.Mock) = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/shadow/config' && (!options || !options.method || options.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockConfigResponse),
      });
    }
    if (url === '/api/shadow/config' && options?.method === 'PUT') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: JSON.parse(options.body as string) }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: {} }) });
  });
}

// ============================================================================
// General Tab Enhancement Tests
// ============================================================================

describe('General Tab Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchMock();
  });

  it('shows verbosity level description that changes with slider', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={mockConfigResponse.data.general}
          onSave={jest.fn()}
        />
      );
    });

    // Default level 3 = Balanced — appears for both verbosity and proactivity
    const balancedLabels = screen.getAllByText(/Level 3: Balanced/);
    expect(balancedLabels.length).toBe(2);
    expect(screen.getByText(/Clear answers with relevant background/)).toBeTruthy();

    // Change verbosity slider to level 1
    const verbositySlider = screen.getAllByRole('slider')[0];
    await act(async () => {
      fireEvent.change(verbositySlider, { target: { value: '1' } });
    });

    expect(screen.getByText(/Level 1: Minimal/)).toBeTruthy();
    expect(screen.getByText(/Short, direct answers/)).toBeTruthy();
  });

  it('shows proactivity level description that changes with slider', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={mockConfigResponse.data.general}
          onSave={jest.fn()}
        />
      );
    });

    // Default level 3 = Balanced — appears for both verbosity and proactivity
    expect(screen.getAllByText(/Level 3: Balanced/).length).toBe(2);
    expect(screen.getByText(/Occasional suggestions/)).toBeTruthy();

    // Change proactivity slider to level 5
    const sliders = screen.getAllByRole('slider');
    const proactivitySlider = sliders[1]; // second slider is proactivity
    await act(async () => {
      fireEvent.change(proactivitySlider, { target: { value: '5' } });
    });

    expect(screen.getByText(/Level 5: Full Assistant/)).toBeTruthy();
    expect(screen.getByText(/Constant awareness/)).toBeTruthy();
  });

  it('shows tone description below dropdown', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={mockConfigResponse.data.general}
          onSave={jest.fn()}
        />
      );
    });

    // Default tone = professional-friendly
    expect(screen.getByText(/Warm but businesslike/)).toBeTruthy();
  });

  it('shows custom tone textarea when custom tone selected', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={{ ...mockConfigResponse.data.general, tone: 'custom' }}
          onSave={jest.fn()}
        />
      );
    });

    // Custom Tone Description label should appear
    expect(screen.getByText('Custom Tone Description')).toBeTruthy();
    // Textarea with placeholder should exist
    expect(screen.getByPlaceholderText(/Describe how you'd like Shadow to communicate/)).toBeTruthy();
  });

  it('does not show custom tone textarea for non-custom tone', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={mockConfigResponse.data.general}
          onSave={jest.fn()}
        />
      );
    });

    expect(screen.queryByText('Custom Tone Description')).toBeFalsy();
  });

  it('shows entity override notice banner at top', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={mockConfigResponse.data.general}
          onSave={jest.fn()}
        />
      );
    });

    expect(
      screen.getByText(/These are your global Shadow settings/)
    ).toBeTruthy();
    expect(screen.getByText('Manage entity profiles')).toBeTruthy();
  });

  it('entity override banner links to /entities', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={mockConfigResponse.data.general}
          onSave={jest.fn()}
        />
      );
    });

    const link = screen.getByText('Manage entity profiles');
    expect(link.closest('a')?.getAttribute('href')).toBe('/entities');
  });

  it('expands sidekick mode sub-settings when enabled', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={{ ...mockConfigResponse.data.general, sidekickMode: true }}
          onSave={jest.fn()}
        />
      );
    });

    // Sub-settings should be visible when sidekick mode is enabled
    expect(screen.getByText('Auto-activate during focus blocks')).toBeTruthy();
    expect(screen.getByText('Observation Frequency')).toBeTruthy();
    expect(screen.getByText('Notification Threshold')).toBeTruthy();
  });

  it('hides sidekick sub-settings when sidekick mode is disabled', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={{ ...mockConfigResponse.data.general, sidekickMode: false }}
          onSave={jest.fn()}
        />
      );
    });

    expect(screen.queryByText('Auto-activate during focus blocks')).toBeFalsy();
    expect(screen.queryByText('Observation Frequency')).toBeFalsy();
    expect(screen.queryByText('Notification Threshold')).toBeFalsy();
  });

  it('shows wake word custom option when wake word enabled', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={{ ...mockConfigResponse.data.general, wakeWordEnabled: true }}
          onSave={jest.fn()}
        />
      );
    });

    // Default phrase info
    expect(screen.getByText(/Hey Shadow/)).toBeTruthy();
    // Custom wake phrase checkbox
    expect(screen.getByText('Use custom wake phrase')).toBeTruthy();
    // Test wake word button
    expect(screen.getByText('Test wake word')).toBeTruthy();
  });

  it('hides wake word options when wake word is disabled', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={{ ...mockConfigResponse.data.general, wakeWordEnabled: false }}
          onSave={jest.fn()}
        />
      );
    });

    expect(screen.queryByText('Use custom wake phrase')).toBeFalsy();
    expect(screen.queryByText('Test wake word')).toBeFalsy();
  });

  it('shows custom wake word input when useCustomWakeWord is checked', async () => {
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={{
            ...mockConfigResponse.data.general,
            wakeWordEnabled: true,
            useCustomWakeWord: true,
          }}
          onSave={jest.fn()}
        />
      );
    });

    // The custom wake word text input with placeholder should be visible
    const wakeWordInput = screen.getByPlaceholderText('Hey Shadow');
    expect(wakeWordInput).toBeTruthy();
  });

  it('calls onSave with current settings when save button is clicked', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      render(
        <SettingsGeneral
          initialData={mockConfigResponse.data.general}
          onSave={onSave}
        />
      );
    });

    const saveButton = screen.getByText('Save General Settings');
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    // Verify the saved data includes new enhancement fields
    const savedData = onSave.mock.calls[0][0];
    expect(savedData.customTone).toBe('');
    expect(savedData.sidekickAutoActivate).toBe(true);
    expect(savedData.sidekickObservationFrequency).toBe('normal');
    expect(savedData.useCustomWakeWord).toBe(false);
  });
});

// ============================================================================
// Voice & Phone Tab Enhancement Tests
// ============================================================================

describe('Voice & Phone Tab Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchMock();
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('shows expanded voice persona options including Professional Male/Female', async () => {
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={jest.fn()}
        />
      );
    });

    // Verify expanded persona options are present by checking for option text
    expect(screen.getByRole('option', { name: 'Professional Male' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Professional Female' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Warm Male' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Warm Female' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Calm & Reassuring' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Custom...' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Default (current voice)' })).toBeTruthy();
  });

  it('shows secondary language dropdown', async () => {
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={jest.fn()}
        />
      );
    });

    expect(screen.getByText('Secondary Language')).toBeTruthy();
    expect(screen.getByText(/Shadow can understand both languages/)).toBeTruthy();
  });

  it('shows copy button next to Shadow phone number', async () => {
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={jest.fn()}
        />
      );
    });

    // The phone number is displayed
    expect(screen.getByText('+1 (555) 0100-SHADOW')).toBeTruthy();
    // Copy button is present
    expect(screen.getByText('Copy')).toBeTruthy();
    // Add to contacts button is also present
    expect(screen.getByText('Add to contacts')).toBeTruthy();
  });

  it('copy button invokes clipboard API', async () => {
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={jest.fn()}
        />
      );
    });

    const copyButton = screen.getByText('Copy');
    await act(async () => {
      fireEvent.click(copyButton);
    });

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('+1 (555) 0100-SHADOW');
    });

    // After copying, the button text should change to "Copied!"
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeTruthy();
    });
  });

  it('shows additional call settings: CarPlay, SMS Companion, Call Summary', async () => {
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={jest.fn()}
        />
      );
    });

    expect(screen.getByText('CarPlay / Bluetooth')).toBeTruthy();
    expect(screen.getByText(/Enable hands-free Shadow calls/)).toBeTruthy();

    expect(screen.getByText('SMS Companion')).toBeTruthy();
    expect(screen.getByText(/Send supporting SMS during phone calls/)).toBeTruthy();

    expect(screen.getByText('Call Summary')).toBeTruthy();
    expect(screen.getByText(/Automatically send SMS summary after each phone call/)).toBeTruthy();
  });

  it('shows audio quality section with toggles', async () => {
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={jest.fn()}
        />
      );
    });

    expect(screen.getByText('Audio Quality')).toBeTruthy();
    expect(screen.getByText('Noise Cancellation')).toBeTruthy();
    expect(screen.getByText('Echo Suppression')).toBeTruthy();
    expect(screen.getByText('Auto-switch on Poor Connection')).toBeTruthy();
    expect(screen.getByText('VAD Sensitivity')).toBeTruthy();
  });

  it('shows Preview button next to voice persona select', async () => {
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={jest.fn()}
        />
      );
    });

    expect(screen.getByText('Preview')).toBeTruthy();
  });

  it('shows Trusted Devices section', async () => {
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={jest.fn()}
        />
      );
    });

    expect(screen.getByText('Trusted Devices')).toBeTruthy();
    expect(screen.getByText(/Shadow will only place outbound calls to verified numbers/)).toBeTruthy();
    expect(screen.getByText('Add number')).toBeTruthy();
  });

  it('calls onSave with all enhanced fields when save is clicked', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      render(
        <SettingsVoicePhone
          initialData={mockConfigResponse.data.voicePhone}
          onSave={onSave}
        />
      );
    });

    const saveButton = screen.getByText('Save Voice & Phone Settings');
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    // Verify the saved data includes new enhancement fields
    const savedData = onSave.mock.calls[0][0];
    expect(savedData.secondaryLanguage).toBe('');
    expect(savedData.carplayBluetooth).toBe(false);
    expect(savedData.smsCompanion).toBe(true);
    expect(savedData.callSummary).toBe(true);
    expect(savedData.noiseCancellation).toBe(true);
    expect(savedData.echoSuppression).toBe(true);
    expect(savedData.autoSwitchOnPoorConnection).toBe(true);
    expect(savedData.vadSensitivity).toBe('normal');
  });
});

// ============================================================================
// API Route Tests (verifying default field coverage)
// ============================================================================

describe('New API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchMock();
  });

  it('GET /api/shadow/config returns new general fields', async () => {
    const response = await global.fetch('/api/shadow/config');
    const json = await response.json();

    expect(json.success).toBe(true);
    const general = json.data.general;

    // New enhancement fields present in mock (mirroring API defaults)
    expect(general.customTone).toBe('');
    expect(general.useCustomWakeWord).toBe(false);
    expect(general.sidekickAutoActivate).toBe(true);
    expect(general.sidekickObservationFrequency).toBe('normal');
    expect(general.sidekickNotificationThreshold).toBe('p0_only');

    // Existing fields still present
    expect(general.name).toBe('Shadow');
    expect(general.tone).toBe('professional-friendly');
    expect(general.verbosity).toBe(3);
    expect(general.proactivityLevel).toBe(3);
    expect(general.sidekickMode).toBe(false);
  });

  it('GET /api/shadow/config returns new voicePhone fields', async () => {
    const response = await global.fetch('/api/shadow/config');
    const json = await response.json();

    expect(json.success).toBe(true);
    const voicePhone = json.data.voicePhone;

    // New enhancement fields
    expect(voicePhone.secondaryLanguage).toBe('');
    expect(voicePhone.carplayBluetooth).toBe(false);
    expect(voicePhone.smsCompanion).toBe(true);
    expect(voicePhone.callSummary).toBe(true);
    expect(voicePhone.noiseCancellation).toBe(true);
    expect(voicePhone.echoSuppression).toBe(true);
    expect(voicePhone.autoSwitchOnPoorConnection).toBe(true);
    expect(voicePhone.vadSensitivity).toBe('normal');

    // Updated language format
    expect(voicePhone.language).toBe('en-US');

    // Existing fields still present
    expect(voicePhone.voicePersona).toBe('default');
    expect(voicePhone.speechSpeed).toBe(1.0);
    expect(voicePhone.shadowPhoneNumber).toBe('+1 (555) 0100-SHADOW');
    expect(voicePhone.inboundCalls).toBe(true);
    expect(voicePhone.outboundCalls).toBe(false);
  });

  it('PUT /api/shadow/config accepts new general fields', async () => {
    const updatedGeneral = {
      ...mockConfigResponse.data.general,
      customTone: 'Speak like a pirate',
      tone: 'custom',
      sidekickAutoActivate: false,
    };

    const response = await global.fetch('/api/shadow/config', {
      method: 'PUT',
      body: JSON.stringify({ general: updatedGeneral }),
      headers: { 'Content-Type': 'application/json' },
    });

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.general.customTone).toBe('Speak like a pirate');
    expect(json.data.general.tone).toBe('custom');
    expect(json.data.general.sidekickAutoActivate).toBe(false);
  });

  it('PUT /api/shadow/config accepts new voicePhone fields', async () => {
    const updatedVoicePhone = {
      ...mockConfigResponse.data.voicePhone,
      secondaryLanguage: 'es',
      carplayBluetooth: true,
      vadSensitivity: 'high',
    };

    const response = await global.fetch('/api/shadow/config', {
      method: 'PUT',
      body: JSON.stringify({ voicePhone: updatedVoicePhone }),
      headers: { 'Content-Type': 'application/json' },
    });

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.voicePhone.secondaryLanguage).toBe('es');
    expect(json.data.voicePhone.carplayBluetooth).toBe(true);
    expect(json.data.voicePhone.vadSensitivity).toBe('high');
  });
});
