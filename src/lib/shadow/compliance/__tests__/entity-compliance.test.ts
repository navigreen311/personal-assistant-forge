/**
 * Unit tests: deriveEntityCompliance + computeEntityCompliance.
 *
 * The pure compute function is tested as a matrix to lock in the
 * mapping for each documented input combination. The DB-backed
 * deriveEntityCompliance wrapper is tested with a prisma mock — proving
 * the lookup uses the right where/select shape and that prisma errors
 * are swallowed (returning `[]`).
 */

const mockEntityFindUnique = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    entity: {
      findUnique: (...args: unknown[]) => mockEntityFindUnique(...args),
    },
  },
}));

import {
  computeEntityCompliance,
  deriveEntityCompliance,
  type ComplianceMode,
} from '../entity-compliance';

describe('computeEntityCompliance — derivation matrix', () => {
  const cases: Array<{
    name: string;
    type: string | null | undefined;
    profile: string[] | null | undefined;
    expected: ComplianceMode[];
  }> = [
    // Type-driven cases
    {
      name: 'medical type → HIPAA',
      type: 'Medical',
      profile: [],
      expected: ['HIPAA'],
    },
    {
      name: 'healthcare type → HIPAA',
      type: 'Healthcare Group',
      profile: [],
      expected: ['HIPAA'],
    },
    {
      name: 'clinic substring → HIPAA',
      type: 'Family Clinic',
      profile: [],
      expected: ['HIPAA'],
    },
    {
      name: 'finance type → PCI',
      type: 'Finance',
      profile: [],
      expected: ['PCI'],
    },
    {
      name: 'banking type → PCI',
      type: 'Banking Practice',
      profile: [],
      expected: ['PCI'],
    },
    {
      name: 'payments type → PCI',
      type: 'Payments Co',
      profile: [],
      expected: ['PCI'],
    },
    {
      name: 'plain Personal type → []',
      type: 'Personal',
      profile: [],
      expected: [],
    },
    {
      name: 'unknown type → []',
      type: 'consulting',
      profile: [],
      expected: [],
    },

    // Profile-driven cases
    {
      name: 'profile flag HIPAA',
      type: 'Personal',
      profile: ['HIPAA'],
      expected: ['HIPAA'],
    },
    {
      name: 'profile flag pci-dss',
      type: 'Personal',
      profile: ['pci-dss'],
      expected: ['PCI'],
    },
    {
      name: 'profile flag gdpr → GDPR',
      type: 'Personal',
      profile: ['gdpr'],
      expected: ['GDPR'],
    },
    {
      name: 'profile flag eu_resident → GDPR',
      type: 'Personal',
      profile: ['eu_resident'],
      expected: ['GDPR'],
    },

    // Combined / order-stable
    {
      name: 'medical type + GDPR profile → HIPAA + GDPR',
      type: 'Medical',
      profile: ['gdpr'],
      expected: ['HIPAA', 'GDPR'],
    },
    {
      name: 'finance type + GDPR profile → PCI + GDPR',
      type: 'Finance',
      profile: ['gdpr'],
      expected: ['PCI', 'GDPR'],
    },
    {
      name: 'all three (medical + pci + gdpr)',
      type: 'Medical',
      profile: ['pci', 'gdpr'],
      expected: ['HIPAA', 'PCI', 'GDPR'],
    },
    {
      name: 'duplicate sources collapse (HIPAA from both type and profile)',
      type: 'Healthcare',
      profile: ['HIPAA', 'phi'],
      expected: ['HIPAA'],
    },

    // Edge cases
    {
      name: 'null type tolerated',
      type: null,
      profile: ['hipaa'],
      expected: ['HIPAA'],
    },
    {
      name: 'undefined profile tolerated',
      type: 'Medical',
      profile: undefined,
      expected: ['HIPAA'],
    },
    {
      name: 'unknown profile flags dropped',
      type: 'Personal',
      profile: ['random-flag', 'CCPA'],
      expected: [],
    },
    {
      name: 'profile with non-string entries (defensive)',
      type: 'Personal',
      // @ts-expect-error — runtime defence
      profile: [null, 42, 'hipaa'],
      expected: ['HIPAA'],
    },
    {
      name: 'case insensitive profile',
      type: 'Personal',
      profile: ['HiPaA', 'GDPR'],
      expected: ['HIPAA', 'GDPR'],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(computeEntityCompliance(c.type, c.profile)).toEqual(c.expected);
    });
  }
});

describe('deriveEntityCompliance — prisma wrapper', () => {
  beforeEach(() => {
    mockEntityFindUnique.mockReset();
  });

  it('returns [] for missing entityId without hitting prisma', async () => {
    const result = await deriveEntityCompliance(undefined);
    expect(result).toEqual([]);
    expect(mockEntityFindUnique).not.toHaveBeenCalled();
  });

  it('returns [] when entity row is not found', async () => {
    mockEntityFindUnique.mockResolvedValue(null);
    const result = await deriveEntityCompliance('ent-1');
    expect(result).toEqual([]);
  });

  it('selects only type + complianceProfile fields', async () => {
    mockEntityFindUnique.mockResolvedValue({
      type: 'Medical',
      complianceProfile: [],
    });
    await deriveEntityCompliance('ent-1');
    expect(mockEntityFindUnique).toHaveBeenCalledWith({
      where: { id: 'ent-1' },
      select: { type: true, complianceProfile: true },
    });
  });

  it('returns HIPAA for a medical entity', async () => {
    mockEntityFindUnique.mockResolvedValue({
      type: 'Medical Practice',
      complianceProfile: [],
    });
    const result = await deriveEntityCompliance('ent-1');
    expect(result).toEqual(['HIPAA']);
  });

  it('merges type + complianceProfile sources', async () => {
    mockEntityFindUnique.mockResolvedValue({
      type: 'Medical',
      complianceProfile: ['gdpr'],
    });
    const result = await deriveEntityCompliance('ent-1');
    expect(result).toEqual(['HIPAA', 'GDPR']);
  });

  it('swallows prisma errors and returns []', async () => {
    mockEntityFindUnique.mockRejectedValue(new Error('db down'));
    const result = await deriveEntityCompliance('ent-1');
    expect(result).toEqual([]);
  });
});
