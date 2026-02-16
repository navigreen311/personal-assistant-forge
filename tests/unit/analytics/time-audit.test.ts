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

describe('detectDriftAlerts', () => {
  it('should flag WARNING for drift > 20%', () => {
    const entries = [
      makeEntry({ category: 'meetings', driftPercent: 25 }),
    ];
    const alerts = detectDriftAlerts(entries);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('WARNING');
    expect(alerts[0].category).toBe('meetings');
  });

  it('should flag CRITICAL for drift > 50%', () => {
    const entries = [
      makeEntry({ category: 'deep_work', driftPercent: 55 }),
    ];
    const alerts = detectDriftAlerts(entries);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('CRITICAL');
    expect(alerts[0].category).toBe('deep_work');
  });

  it('should not alert for drift <= 20%', () => {
    const entries = [
      makeEntry({ category: 'email', driftPercent: 15 }),
      makeEntry({ category: 'admin', driftPercent: 10 }),
      makeEntry({ category: 'personal', driftPercent: 0 }),
    ];
    const alerts = detectDriftAlerts(entries);
    expect(alerts.length).toBe(0);
  });

  it('should include suggested action in alerts', () => {
    const entries = [
      makeEntry({ category: 'meetings', driftPercent: 30 }),
    ];
    const alerts = detectDriftAlerts(entries);
    expect(alerts[0].suggestedAction).toBeTruthy();
    expect(alerts[0].suggestedAction.length).toBeGreaterThan(0);
  });

  it('should identify worst drift category', () => {
    const entries = [
      makeEntry({ category: 'email', driftPercent: 25 }),
      makeEntry({ category: 'meetings', driftPercent: 60 }),
      makeEntry({ category: 'admin', driftPercent: 30 }),
    ];
    const alerts = detectDriftAlerts(entries);
    const critical = alerts.find((a) => a.severity === 'CRITICAL');
    expect(critical).toBeDefined();
    expect(critical!.category).toBe('meetings');
  });
});
