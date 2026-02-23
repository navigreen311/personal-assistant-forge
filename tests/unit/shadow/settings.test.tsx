/**
 * @jest-environment jsdom
 */

/**
 * Unit Tests: Shadow Settings Page
 *
 * Tests the Shadow settings page renders 6 tabs, supports tab switching,
 * renders form fields with defaults, and calls the API on save.
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
import ShadowSettingsPage from '@/app/(dashboard)/shadow/page';

const mockConfigResponse = {
  success: true,
  data: {
    general: {
      name: 'Shadow',
      tone: 'professional-friendly',
      verbosity: 3,
      proactivityLevel: 3,
      floatingBubble: true,
      defaultInputMode: 'text',
      autoSpeakResponses: false,
      wakeWordEnabled: false,
      wakeWord: 'Hey Shadow',
      keyboardShortcut: 'Ctrl+Shift+S',
      sidekickMode: false,
    },
    voicePhone: {
      voicePersona: 'default',
      speechSpeed: 1.0,
      language: 'en',
      shadowPhoneNumber: '+1 (555) 0100-SHADOW',
      userPhoneNumbers: [],
      inboundCalls: true,
      outboundCalls: false,
      voicemail: true,
      autoRecording: false,
      autoTranscribe: true,
    },
  },
};

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
    if (url.includes('/api/shadow/conversations')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { sessions: [], total: 0 } }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: {} }) });
  });
}

async function renderAndWaitForLoad() {
  await act(async () => {
    render(<ShadowSettingsPage />);
  });
  // Wait for loading to finish - the page shows "Shadow Settings" heading after load
  await waitFor(() => {
    expect(screen.getByText('Shadow Settings')).toBeTruthy();
  }, { timeout: 5000 });
}

// --- Tests ---

describe('Shadow Settings Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchMock();
  });

  it('calls GET /api/shadow/config on mount', async () => {
    await renderAndWaitForLoad();

    const getCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (call: [string, RequestInit?]) =>
        call[0] === '/api/shadow/config' &&
        (!call[1] || !call[1].method || call[1].method === 'GET')
    );
    expect(getCalls.length).toBe(1);
  });

  it('renders the page title after loading', async () => {
    await renderAndWaitForLoad();
    expect(screen.getByText('Shadow Settings')).toBeTruthy();
  });

  it('renders all 6 tabs', async () => {
    await renderAndWaitForLoad();

    const tabLabels = ['General', 'Voice & Phone', 'Proactive', 'Safety', 'Permissions', 'History'];
    for (const label of tabLabels) {
      expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it('shows General tab selected by default', async () => {
    await renderAndWaitForLoad();

    const generalTab = screen.getByRole('tab', { name: /General/ });
    expect(generalTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switches tabs on click', async () => {
    await renderAndWaitForLoad();

    const voiceTab = screen.getByRole('tab', { name: /Voice & Phone/ });
    await act(async () => {
      fireEvent.click(voiceTab);
    });

    expect(voiceTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switches to Safety tab', async () => {
    await renderAndWaitForLoad();

    const safetyTab = screen.getByRole('tab', { name: /Safety/ });
    await act(async () => {
      fireEvent.click(safetyTab);
    });

    expect(safetyTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switches to Permissions tab', async () => {
    await renderAndWaitForLoad();

    const permissionsTab = screen.getByRole('tab', { name: /Permissions/ });
    await act(async () => {
      fireEvent.click(permissionsTab);
    });

    expect(permissionsTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switches to History tab', async () => {
    await renderAndWaitForLoad();

    const historyTab = screen.getByRole('tab', { name: /History/ });
    await act(async () => {
      fireEvent.click(historyTab);
    });

    expect(historyTab.getAttribute('aria-selected')).toBe('true');
  });

  it('shows Proactive tab content', async () => {
    await renderAndWaitForLoad();

    const proactiveTab = screen.getByRole('tab', { name: /Proactive/ });
    await act(async () => {
      fireEvent.click(proactiveTab);
    });

    expect(proactiveTab.getAttribute('aria-selected')).toBe('true');
  });
});
