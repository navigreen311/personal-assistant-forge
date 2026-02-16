const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock('../../../src/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

import {
  getPreferences,
  updatePreferences,
  checkDocumentExpiry,
} from '../../../src/modules/travel/services/preferences-service';

describe('getPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should read travel preferences from User.preferences JSON', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      preferences: {
        travel: {
          airlines: [{ name: 'AA', seatPreference: 'window', class: 'economy' }],
          hotels: [],
          dietary: ['vegetarian'],
          budgetPerDayUsd: 300,
          preferredAirports: ['DFW'],
          travelDocuments: [],
        },
      },
    });

    const result = await getPreferences('user-1');

    expect(result.userId).toBe('user-1');
    expect(result.airlines).toHaveLength(1);
    expect(result.airlines[0].name).toBe('AA');
    expect(result.dietary).toContain('vegetarian');
    expect(result.budgetPerDayUsd).toBe(300);
  });

  it('should return defaults when no travel preferences exist', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      preferences: {},
    });

    const result = await getPreferences('user-1');

    expect(result.userId).toBe('user-1');
    expect(result.airlines).toEqual([]);
    expect(result.hotels).toEqual([]);
    expect(result.dietary).toEqual([]);
    expect(result.budgetPerDayUsd).toBe(200);
    expect(result.preferredAirports).toEqual([]);
    expect(result.travelDocuments).toEqual([]);
  });

  it('should return defaults when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const result = await getPreferences('nonexistent');

    expect(result.userId).toBe('nonexistent');
    expect(result.budgetPerDayUsd).toBe(200);
  });
});

describe('updatePreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserUpdate.mockResolvedValue({});
  });

  it('should merge updates into User.preferences', async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        preferences: { theme: 'dark' },
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        preferences: { theme: 'dark' },
      });

    const result = await updatePreferences('user-1', { budgetPerDayUsd: 500 });

    expect(result.budgetPerDayUsd).toBe(500);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          preferences: expect.objectContaining({
            theme: 'dark',
            travel: expect.objectContaining({
              budgetPerDayUsd: 500,
            }),
          }),
        }),
      })
    );
  });

  it('should learn seat preferences from patterns', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      preferences: {},
    });

    const result = await updatePreferences('user-1', {
      airlines: [
        { name: 'AA', seatPreference: 'window', class: 'economy' },
        { name: 'UA', seatPreference: '', class: 'economy' },
        { name: 'DL', seatPreference: 'window', class: 'economy' },
      ],
    });

    // The empty seat preference should be filled with 'window' (most common)
    expect(result.airlines[1].seatPreference).toBe('window');
  });

  it('should flag expiring documents', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      preferences: {},
    });

    const result = await updatePreferences('user-1', {
      travelDocuments: [
        {
          type: 'PASSPORT',
          number: 'US123',
          expirationDate: new Date('2026-04-01'), // ~2 months away, within 6 months
          issuingCountry: 'US',
          isExpiringSoon: false,
        },
      ],
    });

    expect(result.travelDocuments[0].isExpiringSoon).toBe(true);
  });
});

describe('checkDocumentExpiry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return only expiring documents', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      preferences: {
        travel: {
          airlines: [],
          hotels: [],
          dietary: [],
          budgetPerDayUsd: 200,
          preferredAirports: [],
          travelDocuments: [
            { type: 'PASSPORT', number: 'US123', expirationDate: '2026-04-01', issuingCountry: 'US', isExpiringSoon: false },
            { type: 'GLOBAL_ENTRY', number: 'GE456', expirationDate: '2030-01-01', issuingCountry: 'US', isExpiringSoon: false },
          ],
        },
      },
    });

    const result = await checkDocumentExpiry('user-1');

    // Only the passport expiring in 2 months should be returned
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('PASSPORT');
    expect(result[0].isExpiringSoon).toBe(true);
  });
});
