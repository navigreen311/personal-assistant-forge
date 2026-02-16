const mockGenerateJSON = jest.fn();
jest.mock('../../../src/lib/ai', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

// Mock preferences-service for validateTravelDocuments
jest.mock('../../../src/modules/travel/services/preferences-service', () => ({
  getPreferences: jest.fn().mockResolvedValue({
    userId: 'user-1',
    airlines: [],
    hotels: [],
    dietary: [],
    budgetPerDayUsd: 200,
    preferredAirports: [],
    travelDocuments: [
      { type: 'PASSPORT', number: 'US123', expirationDate: new Date('2030-01-01'), issuingCountry: 'US', isExpiringSoon: false },
    ],
  }),
}));

import { checkVisaRequirements } from '../../../src/modules/travel/services/visa-checker-service';

describe('checkVisaRequirements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return known requirement for US->JP', async () => {
    const result = await checkVisaRequirements('US', 'JP');

    expect(result.destinationCountry).toBe('JP');
    expect(result.citizenshipCountry).toBe('US');
    expect(result.visaRequired).toBe(false);
    expect(result.documentRequired).toContain('PASSPORT');
    expect(result.notes).toContain('90 days');
    // Should NOT call AI for a known pair
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it('should return known requirement for US->CN with visa required', async () => {
    const result = await checkVisaRequirements('US', 'CN');

    expect(result.visaRequired).toBe(true);
    expect(result.visaType).toBe('Tourist Visa (L)');
    expect(result.processingDays).toBe(10);
    expect(result.documentRequired).toContain('PASSPORT');
    expect(result.documentRequired).toContain('INVITATION_LETTER');
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it('should return known requirement for US->KR (newly added pair)', async () => {
    const result = await checkVisaRequirements('US', 'KR');

    expect(result.destinationCountry).toBe('KR');
    expect(result.visaRequired).toBe(false);
    expect(result.notes).toContain('K-ETA');
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it('should return known requirement for inbound IN->US', async () => {
    const result = await checkVisaRequirements('IN', 'US');

    expect(result.visaRequired).toBe(true);
    expect(result.visaType).toContain('B-1/B-2');
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it('should call AI for unknown country pairs', async () => {
    mockGenerateJSON.mockResolvedValue({
      destinationCountry: 'RU',
      citizenshipCountry: 'US',
      visaRequired: true,
      visaType: 'Tourist Visa',
      processingDays: 20,
      documentRequired: ['PASSPORT', 'PHOTO', 'INVITATION_LETTER'],
      notes: 'US citizens need a visa for Russia.',
    });

    const result = await checkVisaRequirements('US', 'RU');

    expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    expect(result.visaRequired).toBe(true);
    expect(result.destinationCountry).toBe('RU');
  });

  it('should fallback to conservative defaults on AI failure', async () => {
    mockGenerateJSON.mockRejectedValue(new Error('AI error'));

    const result = await checkVisaRequirements('US', 'XY');

    expect(result.visaRequired).toBe(true);
    expect(result.visaType).toBe('Tourist Visa');
    expect(result.processingDays).toBe(14);
    expect(result.documentRequired).toContain('PASSPORT');
    expect(result.notes).toContain('Check with the destination');
  });

  it('should have at least 30 entries in the lookup table', async () => {
    // Test a selection of known pairs to verify the expanded table
    const knownPairs = [
      'US->CA', 'US->MX', 'US->GB', 'US->JP', 'US->AU', 'US->BR', 'US->CN', 'US->IN',
      'US->KR', 'US->TH', 'US->SG', 'US->DE', 'US->FR', 'US->IT', 'US->ES',
      'US->AE', 'US->IL', 'US->NZ', 'US->CO', 'US->AR', 'US->ZA',
      'CA->US', 'GB->US', 'AU->US', 'JP->US', 'DE->US', 'IN->US', 'BR->US', 'CN->US',
    ];

    for (const pair of knownPairs) {
      const [from, to] = pair.split('->');
      const result = await checkVisaRequirements(from, to);
      expect(result.destinationCountry).toBe(to);
      expect(result.citizenshipCountry).toBe(from);
      expect(mockGenerateJSON).not.toHaveBeenCalled();
    }
  });
});
