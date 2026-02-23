/**
 * @jest-environment jsdom
 */

/**
 * Unit Tests: Shadow Settings — Safety, Permissions, and History Tab Enhancements
 *
 * Tests the enhanced Safety tab (PIN status badges, PIN strength indicator,
 * PIN error validation, Data Deletion checkbox, blast radius options with
 * descriptions, Anti-Fraud Protections card, Recent Security Events section),
 * enhanced Permissions tab (corrected default levels, new actions, Reversible
 * and Blast Radius columns, override options, entity-specific overrides notice,
 * Save button, autonomy level preview), and History tab (stat cards, channel
 * filter, retention info bar, analytics toggle, export button, clear modal).
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
import SettingsSafety from '@/modules/shadow/components/SettingsSafety';
import SettingsPermissions from '@/modules/shadow/components/SettingsPermissions';
import SettingsHistory from '@/modules/shadow/components/SettingsHistory';
import RetentionInfoBar from '@/modules/shadow/components/RetentionInfoBar';
import SessionAnalyticsChart from '@/modules/shadow/components/SessionAnalyticsChart';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSafetyData = {
  voicePinSet: false,
  newPin: '',
  confirmPin: '',
  requirePinForFinancial: true,
  requirePinForExternal: false,
  requirePinForCrisis: true,
  requirePinForDataDeletion: true,
  blastRadiusThreshold: 'entity',
  financialThreshold: 500,
  alwaysAnnounceAffectedCount: true,
  alwaysAnnounceCost: true,
  alwaysAnnounceIrreversibility: true,
};

const mockSafetyDataPinSet = {
  ...mockSafetyData,
  voicePinSet: true,
};

// ---------------------------------------------------------------------------
// Fetch mock setup
// ---------------------------------------------------------------------------

function setupFetchMock() {
  (global.fetch as jest.Mock) = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/shadow/conversations')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { sessions: [] } }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/shadow/security-events')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { events: [] } }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/shadow/config/trusted-devices')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { devices: [] } }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/shadow/config/pin')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/entities')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: {} }) });
  });
}

function setupFetchMockWithSessions() {
  (global.fetch as jest.Mock) = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/shadow/conversations')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              sessions: [
                {
                  id: 's1',
                  startedAt: '2026-01-15T10:00:00Z',
                  totalDurationSeconds: 120,
                  currentChannel: 'web',
                  messageCount: 5,
                  aiSummary: 'Test session',
                  actions: [],
                  actionsCount: 0,
                },
              ],
              approvalRate: 90,
            },
          }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/entities')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: {} }) });
  });
}

// ============================================================================
// Safety Tab Enhancement Tests
// ============================================================================

describe('Safety Tab Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchMock();
  });

  it('shows PIN status badge — Not Set when voicePinSet is false', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    expect(screen.getByText('Not Set')).toBeTruthy();
    expect(screen.getByText('Current Status:')).toBeTruthy();
  });

  it('shows PIN status badge — Active when voicePinSet is true', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyDataPinSet} onSave={jest.fn()} />);
    });

    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows Set PIN button in PIN section', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    // When voicePinSet is false, the form is shown by default with a "Set PIN" button
    expect(screen.getByText('Set PIN', { selector: 'button' })).toBeTruthy();
  });

  it('shows PIN strength indicator when typing PIN', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    // Type a 4-digit PIN
    const pinInput = screen.getByPlaceholderText('New PIN (4-6 digits)');
    await act(async () => {
      fireEvent.change(pinInput, { target: { value: '1234' } });
    });

    // Should show "Weak" for a 4-digit PIN
    expect(screen.getByText('PIN Strength:')).toBeTruthy();
    expect(screen.getByText('Weak')).toBeTruthy();

    // Now type a 6-digit PIN for "Strong"
    await act(async () => {
      fireEvent.change(pinInput, { target: { value: '123456' } });
    });

    expect(screen.getByText('Strong')).toBeTruthy();
  });

  it('shows pin error when PINs do not match', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    const newPinInput = screen.getByPlaceholderText('New PIN (4-6 digits)');
    const confirmPinInput = screen.getByPlaceholderText('Confirm PIN');

    await act(async () => {
      fireEvent.change(newPinInput, { target: { value: '1234' } });
    });
    await act(async () => {
      fireEvent.change(confirmPinInput, { target: { value: '5678' } });
    });

    // Click Set PIN to trigger validation
    const setPinBtn = screen.getByText('Set PIN', { selector: 'button' });
    await act(async () => {
      fireEvent.click(setPinBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('PINs do not match')).toBeTruthy();
    });
  });

  it('shows Data Deletion checkbox in PIN-Required Actions', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    expect(screen.getByText('Data Deletion')).toBeTruthy();
    expect(screen.getByText(/Deleting records, clearing history/)).toBeTruthy();
  });

  it('shows all 4 blast radius options including Public', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    // The blast radius select should have 4 options
    expect(screen.getByRole('option', { name: /Self/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Entity/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /External/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Public/ })).toBeTruthy();
  });

  it('shows blast radius description text below dropdown', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    // Default value is 'entity', so we should see the entity description
    expect(
      screen.getByText(/Any action that affects an entity/)
    ).toBeTruthy();
  });

  it('shows Anti-Fraud Protections info card', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    expect(screen.getByText('Anti-Fraud Protections')).toBeTruthy();
    expect(
      screen.getByText(/Built-in protections \(always active/)
    ).toBeTruthy();
  });

  it('anti-fraud card lists wire transfers and credential sharing', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    expect(screen.getByText('Wire transfers to new/unverified accounts')).toBeTruthy();
    expect(screen.getByText('Sharing credentials, passwords, or API keys')).toBeTruthy();
  });

  it('shows Recent Security Events section', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyData} onSave={jest.fn()} />);
    });

    expect(screen.getByText('Recent Security Events')).toBeTruthy();
    expect(screen.getByText(/The last 5 security-related events/)).toBeTruthy();
  });

  it('shows Change PIN and Remove PIN buttons when PIN is already set', async () => {
    await act(async () => {
      render(<SettingsSafety initialData={mockSafetyDataPinSet} onSave={jest.fn()} />);
    });

    expect(screen.getByText('Change PIN')).toBeTruthy();
    expect(screen.getByText('Remove PIN')).toBeTruthy();
  });
});

// ============================================================================
// Permissions Tab Enhancement Tests
// ============================================================================

describe('Permissions Tab Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchMock();
  });

  it('shows corrected default levels — Create Task is NONE', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    // Find the Create Task row and verify its level badge shows NONE
    const createTaskCell = screen.getByText('Create Task');
    const row = createTaskCell.closest('tr')!;
    const badges = row.querySelectorAll('span');
    const levelBadge = Array.from(badges).find((b) => b.textContent === 'NONE');
    expect(levelBadge).toBeTruthy();
  });

  it('shows corrected default levels — Draft Email is NONE', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    const draftEmailCell = screen.getByText('Draft Email');
    const row = draftEmailCell.closest('tr')!;
    const badges = row.querySelectorAll('span');
    const levelBadge = Array.from(badges).find((b) => b.textContent === 'NONE');
    expect(levelBadge).toBeTruthy();
  });

  it('shows corrected default levels — Create Invoice is TAP', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    const createInvoiceCell = screen.getByText('Create Invoice');
    const row = createInvoiceCell.closest('tr')!;
    const badges = row.querySelectorAll('span');
    const levelBadge = Array.from(badges).find((b) => b.textContent === 'TAP');
    expect(levelBadge).toBeTruthy();
  });

  it('shows corrected default levels — Send Invoice is CONFIRM', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    const sendInvoiceCell = screen.getByText('Send Invoice');
    const row = sendInvoiceCell.closest('tr')!;
    const badges = row.querySelectorAll('span');
    const levelBadge = Array.from(badges).find((b) => b.textContent === 'CONFIRM');
    expect(levelBadge).toBeTruthy();
  });

  it('shows new actions — Classify/Triage Email', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    expect(screen.getByText('Classify/Triage Email')).toBeTruthy();
  });

  it('shows new actions — Search Knowledge', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    expect(screen.getByText('Search Knowledge')).toBeTruthy();
  });

  it('shows new actions — Activate Phone Tree', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    expect(screen.getByText('Activate Phone Tree')).toBeTruthy();
  });

  it('shows Reversible column in the table', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    expect(screen.getByText('Reversible')).toBeTruthy();
  });

  it('shows Blast Radius column in the table', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    expect(screen.getByText('Blast Radius')).toBeTruthy();
  });

  it('shows real override options — None, Tap, Confirm phrase, PIN, Disabled', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    // Get the first override select (there are 18 actions, each with a select)
    const overrideSelects = screen.getAllByRole('combobox');
    expect(overrideSelects.length).toBeGreaterThan(0);

    const firstSelect = overrideSelects[0];
    const options = firstSelect.querySelectorAll('option');
    const optionTexts = Array.from(options).map((o) => o.textContent);

    expect(optionTexts).toContain('Default');
    expect(optionTexts).toContain('None (trust Shadow)');
    expect(optionTexts).toContain('Tap (verbal yes)');
    expect(optionTexts).toContain('Confirm phrase');
    expect(optionTexts).toContain('PIN required');
    expect(optionTexts).toContain('Disabled (blocked)');
  });

  it('shows entity-specific overrides notice', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    expect(
      screen.getByText(/These are global permissions/)
    ).toBeTruthy();
    expect(
      screen.getByText(/MedLink may require PIN/)
    ).toBeTruthy();
  });

  it('shows Save Permission Settings button', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    expect(screen.getByText('Save Permission Settings')).toBeTruthy();
  });

  it('shows autonomy level preview when switching levels', async () => {
    await act(async () => {
      render(<SettingsPermissions onSave={jest.fn()} />);
    });

    // Default is 'balanced'. Click 'Conservative' to trigger preview.
    const conservativeBtn = screen.getByText('Conservative');
    await act(async () => {
      fireEvent.click(conservativeBtn);
    });

    // Preview panel should appear with changes listed
    await waitFor(() => {
      expect(screen.getByText(/Preview: Switching to/)).toBeTruthy();
    });

    // In conservative mode, NONE actions go to TAP, so we should see changes
    expect(screen.getByText(/The following action levels will change/)).toBeTruthy();
  });
});

// ============================================================================
// History Tab Enhancement Tests
// ============================================================================

describe('History Tab Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchMock();
  });

  it('shows 5 stat cards including Approval Rate', async () => {
    await act(async () => {
      render(<SettingsHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('Total Sessions')).toBeTruthy();
    });

    expect(screen.getByText('Voice Sessions')).toBeTruthy();
    expect(screen.getByText('Actions Executed')).toBeTruthy();
    expect(screen.getByText('Time Saved')).toBeTruthy();
    expect(screen.getByText('Approval Rate')).toBeTruthy();
  });

  it('shows entity filter dropdown', async () => {
    await act(async () => {
      render(<SettingsHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('Total Sessions')).toBeTruthy();
    });

    const entitySelect = screen.getByDisplayValue('All Entities');
    expect(entitySelect).toBeTruthy();
  });

  it('shows retention info bar', async () => {
    await act(async () => {
      render(<SettingsHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('Total Sessions')).toBeTruthy();
    });

    expect(screen.getByText('Data Retention')).toBeTruthy();
  });

  it('shows analytics toggle button', async () => {
    await act(async () => {
      render(<SettingsHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('Total Sessions')).toBeTruthy();
    });

    expect(screen.getByText('Show analytics')).toBeTruthy();
  });

  it('export button has dropdown options', async () => {
    setupFetchMockWithSessions();

    await act(async () => {
      render(<SettingsHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test session')).toBeTruthy();
    });

    // Click the export dropdown button
    const exportBtn = screen.getByText('Export History');
    await act(async () => {
      fireEvent.click(exportBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Export all (JSON)')).toBeTruthy();
    });

    expect(screen.getByText('Export all (PDF summary)')).toBeTruthy();
    expect(screen.getByText(/Export recordings only/)).toBeTruthy();
    expect(screen.getByText(/Export transcripts only/)).toBeTruthy();
  });

  it('clear modal requires typing DELETE to confirm', async () => {
    setupFetchMockWithSessions();

    await act(async () => {
      render(<SettingsHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test session')).toBeTruthy();
    });

    // Click the clear dropdown button
    const clearBtn = screen.getByText('Clear History');
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    // Select "Clear all history" from the dropdown
    await waitFor(() => {
      expect(screen.getByText('Clear all history')).toBeTruthy();
    });

    const clearAllOption = screen.getByText('Clear all history');
    await act(async () => {
      fireEvent.click(clearAllOption);
    });

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText('This action cannot be undone.')).toBeTruthy();
    });

    // Should have the DELETE confirmation input
    expect(screen.getByPlaceholderText('DELETE')).toBeTruthy();
    expect(screen.getByText(/Type/)).toBeTruthy();

    // The delete button should be disabled until DELETE is typed
    const deleteBtn = screen.getByText('Delete permanently');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn.hasAttribute('disabled')).toBe(true);

    // Type DELETE to enable
    const confirmInput = screen.getByPlaceholderText('DELETE');
    await act(async () => {
      fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
    });

    // Now the delete button should be enabled
    await waitFor(() => {
      expect(deleteBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('shows empty state when no sessions', async () => {
    await act(async () => {
      render(<SettingsHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('No sessions found')).toBeTruthy();
    });

    expect(
      screen.getByText(/Start a conversation with Shadow/)
    ).toBeTruthy();
  });

  it('shows channel filter dropdown with All Channels, Web, Phone, Mobile', async () => {
    await act(async () => {
      render(<SettingsHistory />);
    });

    await waitFor(() => {
      expect(screen.getByText('Total Sessions')).toBeTruthy();
    });

    const channelSelect = screen.getByDisplayValue('All Channels');
    expect(channelSelect).toBeTruthy();

    const options = channelSelect.querySelectorAll('option');
    const optionTexts = Array.from(options).map((o) => o.textContent);
    expect(optionTexts).toContain('All Channels');
    expect(optionTexts).toContain('Web');
    expect(optionTexts).toContain('Phone');
    expect(optionTexts).toContain('Mobile');
  });
});

// ============================================================================
// RetentionInfoBar Component Tests
// ============================================================================

describe('Retention Info Bar', () => {
  it('shows retention info bar with data retention periods', async () => {
    await act(async () => {
      render(<RetentionInfoBar />);
    });

    expect(screen.getByText('Data Retention')).toBeTruthy();
    expect(screen.getByText('Recordings:')).toBeTruthy();
    expect(screen.getByText('Transcripts:')).toBeTruthy();
    expect(screen.getByText('Receipts:')).toBeTruthy();
  });

  it('shows auto-redaction status', async () => {
    await act(async () => {
      render(<RetentionInfoBar />);
    });

    expect(screen.getByText(/Auto-redaction: ON/)).toBeTruthy();
    expect(screen.getByText(/PII\/PHI\/PCI scrubbed/)).toBeTruthy();
  });

  it('shows link to change retention settings', async () => {
    await act(async () => {
      render(<RetentionInfoBar />);
    });

    const link = screen.getByText('Change retention settings');
    expect(link).toBeTruthy();
    expect(link.closest('a')?.getAttribute('href')).toBe('/settings');
  });
});

// ============================================================================
// SessionAnalyticsChart Component Tests
// ============================================================================

describe('Session Analytics Chart', () => {
  it('shows analytics toggle button', async () => {
    await act(async () => {
      render(
        <SessionAnalyticsChart
          sessions={[]}
          stats={{ totalSessions: 0, approvalRate: 0 }}
        />
      );
    });

    expect(screen.getByText('Show analytics')).toBeTruthy();
  });

  it('expands analytics panel when toggle is clicked', async () => {
    await act(async () => {
      render(
        <SessionAnalyticsChart
          sessions={[]}
          stats={{ totalSessions: 10, approvalRate: 85 }}
        />
      );
    });

    const toggleBtn = screen.getByText('Show analytics');
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Hide analytics')).toBeTruthy();
    });

    // Should show chart sections
    expect(screen.getByText(/Sessions Over Time/)).toBeTruthy();
    expect(screen.getByText('Channel Breakdown')).toBeTruthy();
    expect(screen.getByText('Top Actions')).toBeTruthy();
    expect(screen.getByText(/Override Rate/)).toBeTruthy();
  });

  it('shows Approval Rate stat in analytics', async () => {
    await act(async () => {
      render(
        <SessionAnalyticsChart
          sessions={[]}
          stats={{ totalSessions: 10, approvalRate: 85 }}
        />
      );
    });

    const toggleBtn = screen.getByText('Show analytics');
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('85%')).toBeTruthy();
    });

    expect(screen.getByText(/Percentage of Shadow suggestions accepted/)).toBeTruthy();
  });
});
