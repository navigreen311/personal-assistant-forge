import {
  recordTimeSaved,
  getTimeSavedSummary,
  getRunningTotal,
  calculateStreak,
  _resetTimeSavedStore,
  _getTimeSavedEntries,
} from '@/engines/adoption/time-saved-service';

const TEST_USER = 'test-user-time';

beforeEach(() => {
  _resetTimeSavedStore();
});

describe('getTimeSavedSummary', () => {
  it('should aggregate total minutes correctly', async () => {
    await recordTimeSaved(TEST_USER, 'email triage', 10, 'email');
    await recordTimeSaved(TEST_USER, 'meeting prep', 15, 'calendar');
    await recordTimeSaved(TEST_USER, 'data entry', 20, 'data_entry');

    const summary = await getTimeSavedSummary(TEST_USER);
    expect(summary.totalMinutesSaved).toBe(45);
    expect(summary.totalHoursSaved).toBe(0.75);
  });

  it('should break down by category', async () => {
    await recordTimeSaved(TEST_USER, 'triage', 10, 'email');
    await recordTimeSaved(TEST_USER, 'draft', 5, 'email');
    await recordTimeSaved(TEST_USER, 'prep', 15, 'calendar');

    const summary = await getTimeSavedSummary(TEST_USER);
    expect(summary.byCategory['email']).toBe(15);
    expect(summary.byCategory['calendar']).toBe(15);
  });

  it('should calculate streak correctly', async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Manually add entries with specific dates
    const entries = _getTimeSavedEntries();
    entries.push(
      { id: '1', userId: TEST_USER, action: 'a', minutesSaved: 10, category: 'email', timestamp: twoDaysAgo },
      { id: '2', userId: TEST_USER, action: 'b', minutesSaved: 10, category: 'email', timestamp: yesterday },
      { id: '3', userId: TEST_USER, action: 'c', minutesSaved: 10, category: 'email', timestamp: today },
    );

    const summary = await getTimeSavedSummary(TEST_USER);
    expect(summary.streak).toBe(3);
  });

  it('should project monthly savings from recent data', async () => {
    await recordTimeSaved(TEST_USER, 'task', 60, 'email');

    const summary = await getTimeSavedSummary(TEST_USER);
    // 60 minutes in 1 day × 30 days = 1800
    expect(summary.projectedMonthlySavings).toBe(1800);
  });
});

describe('getRunningTotal', () => {
  it('should return formatted display as "Xh Ym saved"', async () => {
    await recordTimeSaved(TEST_USER, 'a', 90, 'email');
    await recordTimeSaved(TEST_USER, 'b', 45, 'calendar');

    const total = await getRunningTotal(TEST_USER);
    expect(total.totalMinutes).toBe(135);
    expect(total.totalHours).toBe(2);
    expect(total.formattedDisplay).toBe('2h 15m saved');
  });

  it('should handle zero time saved', async () => {
    const total = await getRunningTotal(TEST_USER);
    expect(total.totalMinutes).toBe(0);
    expect(total.formattedDisplay).toBe('0m saved');
  });

  it('should handle only minutes (< 60 min)', async () => {
    await recordTimeSaved(TEST_USER, 'a', 30, 'email');

    const total = await getRunningTotal(TEST_USER);
    expect(total.formattedDisplay).toBe('30m saved');
  });

  it('should handle large totals (100+ hours)', async () => {
    await recordTimeSaved(TEST_USER, 'a', 6030, 'email'); // 100h 30m

    const total = await getRunningTotal(TEST_USER);
    expect(total.totalHours).toBe(100);
    expect(total.formattedDisplay).toBe('100h 30m saved');
  });
});

describe('calculateStreak', () => {
  it('should return 0 for no entries', async () => {
    const streak = await calculateStreak(TEST_USER);
    expect(streak).toBe(0);
  });

  it('should return 1 for entries only today', async () => {
    await recordTimeSaved(TEST_USER, 'a', 10, 'email');
    const streak = await calculateStreak(TEST_USER);
    expect(streak).toBe(1);
  });

  it('should return correct streak for consecutive days', async () => {
    const entries = _getTimeSavedEntries();
    const today = new Date();
    for (let i = 0; i < 5; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      entries.push({ id: `streak-${i}`, userId: TEST_USER, action: 'a', minutesSaved: 10, category: 'email', timestamp: date });
    }
    const streak = await calculateStreak(TEST_USER);
    expect(streak).toBe(5);
  });

  it('should break streak on gaps', async () => {
    const entries = _getTimeSavedEntries();
    const today = new Date();
    // Today and yesterday
    entries.push({ id: 'g1', userId: TEST_USER, action: 'a', minutesSaved: 10, category: 'email', timestamp: today });
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    entries.push({ id: 'g2', userId: TEST_USER, action: 'a', minutesSaved: 10, category: 'email', timestamp: yesterday });
    // Gap: skip day -2
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    entries.push({ id: 'g3', userId: TEST_USER, action: 'a', minutesSaved: 10, category: 'email', timestamp: threeDaysAgo });

    const streak = await calculateStreak(TEST_USER);
    expect(streak).toBe(2); // today + yesterday, gap breaks it
  });
});
