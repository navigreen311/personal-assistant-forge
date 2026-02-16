import { detectDriftAlerts } from '@/modules/analytics/services/time-audit-service';
import type { TimeAuditEntry } from '@/modules/analytics/types';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    message: { count: jest.fn() },
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated time management suggestion'),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

const { generateText } = require('@/lib/ai');

function makeEntry(overrides: Partial<TimeAuditEntry> = {}): TimeAuditEntry {
  return {
    date: '2026-02-15',
    category: 'meetings',
    intendedMinutes: 120,
    actualMinutes: 120,
    driftMinutes: 0,
    driftPercent: 0,
    ...overrides,
  };
}

describe('detectDriftAlerts (AI-enhanced)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should flag WARNING for drift > 20%', async () => {
    const entries = [
      makeEntry({ category: 'meetings', driftPercent: 25 }),
    ];
    const alerts = await detectDriftAlerts(entries);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('WARNING');
    expect(alerts[0].category).toBe('meetings');
  });

  it('should flag CRITICAL for drift > 50%', async () => {
    const entries = [
      makeEntry({ category: 'deep_work', driftPercent: 55 }),
    ];
    const alerts = await detectDriftAlerts(entries);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('CRITICAL');
    expect(alerts[0].category).toBe('deep_work');
  });

  it('should not alert for drift <= 20%', async () => {
    const entries = [
      makeEntry({ category: 'email', driftPercent: 15 }),
      makeEntry({ category: 'admin', driftPercent: 10 }),
      makeEntry({ category: 'personal', driftPercent: 0 }),
    ];
    const alerts = await detectDriftAlerts(entries);
    expect(alerts.length).toBe(0);
  });

  it('should call generateText to enhance suggestedAction', async () => {
    const entries = [
      makeEntry({ category: 'meetings', driftPercent: 30, intendedMinutes: 120, actualMinutes: 156, driftMinutes: 36 }),
    ];
    const alerts = await detectDriftAlerts(entries);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(alerts[0].suggestedAction).toBe('AI-generated time management suggestion');
  });

  it('should include drift data in prompt', async () => {
    const entries = [
      makeEntry({ category: 'deep_work', driftPercent: 60, intendedMinutes: 240, actualMinutes: 384, driftMinutes: 144 }),
    ];
    await detectDriftAlerts(entries);
    const prompt = generateText.mock.calls[0][0] as string;
    expect(prompt).toContain('deep_work');
    expect(prompt).toContain('60%');
  });

  it('should fall back to static suggestion if AI fails', async () => {
    generateText.mockRejectedValueOnce(new Error('AI unavailable'));

    const entries = [
      makeEntry({ category: 'meetings', driftPercent: 30 }),
    ];
    const alerts = await detectDriftAlerts(entries);
    expect(alerts.length).toBe(1);
    expect(alerts[0].suggestedAction).toBeTruthy();
    expect(alerts[0].suggestedAction.length).toBeGreaterThan(0);
  });

  it('should identify worst drift category', async () => {
    const entries = [
      makeEntry({ category: 'email', driftPercent: 25 }),
      makeEntry({ category: 'meetings', driftPercent: 60 }),
      makeEntry({ category: 'admin', driftPercent: 30 }),
    ];
    const alerts = await detectDriftAlerts(entries);
    const critical = alerts.find((a) => a.severity === 'CRITICAL');
    expect(critical).toBeDefined();
    expect(critical!.category).toBe('meetings');
  });
});
