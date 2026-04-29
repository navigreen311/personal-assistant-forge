/**
 * Entity compliance derivation.
 *
 * Maps an Entity's `type` and `complianceProfile` fields to a normalised
 * list of compliance modes that downstream VAF clients understand
 * (currently `['HIPAA' | 'PCI' | 'GDPR']`).
 *
 * Used by VoiceInAppHandler so medical entities automatically get
 * PHI-aware (HIPAA) STT, finance entities get PCI-mode, and EU residents
 * pick up GDPR — all without requiring callers to plumb through a
 * separate flag at every site.
 *
 * Schema reference (prisma/schema.prisma → model Entity):
 *   - `type: String` (free-form, defaults to "Personal"). We match
 *     case-insensitively against keyword fragments rather than exact
 *     values so that "Medical Practice", "Healthcare Group", and
 *     "Family Clinic" all collapse to HIPAA.
 *   - `complianceProfile: String[]` (additional compliance flags set
 *     out-of-band, e.g. by an entity-onboarding flow). Anything in the
 *     list that matches a known mode is preserved and merged with the
 *     type-derived modes.
 *
 * The result is deduplicated and order-stable: HIPAA, PCI, GDPR.
 */

import { prisma } from '@/lib/db';

export type ComplianceMode = 'HIPAA' | 'PCI' | 'GDPR';

const ALL_MODES: ComplianceMode[] = ['HIPAA', 'PCI', 'GDPR'];

/**
 * Substring keywords on Entity.type that imply each compliance mode.
 * Matched case-insensitively. Order doesn't matter — multiple matches
 * are merged.
 */
const TYPE_KEYWORD_TO_MODE: Array<{
  keywords: readonly string[];
  mode: ComplianceMode;
}> = [
  {
    keywords: ['medical', 'healthcare', 'health-care', 'clinic', 'hospital', 'phi'],
    mode: 'HIPAA',
  },
  {
    keywords: ['finance', 'financial', 'payment', 'payments', 'banking', 'bank'],
    mode: 'PCI',
  },
  {
    // GDPR rarely shows up in `type` (which is more about industry) but
    // we still match defensively in case an entity is labelled "EU" /
    // "GDPR" / "EU resident".
    keywords: ['gdpr', 'eu_resident', 'eu-resident'],
    mode: 'GDPR',
  },
];

/**
 * Strings on Entity.complianceProfile[] that map to each mode. Matched
 * case-insensitively. Anything not on this list is dropped — we never
 * forward an unknown compliance string to VAF.
 */
const PROFILE_FLAG_TO_MODE: Record<string, ComplianceMode> = {
  hipaa: 'HIPAA',
  phi: 'HIPAA',
  medical: 'HIPAA',
  pci: 'PCI',
  'pci-dss': 'PCI',
  payments: 'PCI',
  gdpr: 'GDPR',
  eu_resident: 'GDPR',
  'eu-resident': 'GDPR',
};

/**
 * Pure derivation step — exposed for testing without prisma. Given the
 * raw `type` and `complianceProfile` values from an Entity row, produce
 * the normalised list.
 */
export function computeEntityCompliance(
  type: string | null | undefined,
  complianceProfile: ReadonlyArray<string> | null | undefined
): ComplianceMode[] {
  const found = new Set<ComplianceMode>();

  // Type-based derivation.
  if (type && type.trim().length > 0) {
    const lower = type.toLowerCase();
    for (const { keywords, mode } of TYPE_KEYWORD_TO_MODE) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          found.add(mode);
          break;
        }
      }
    }
  }

  // Compliance-profile-based derivation.
  if (Array.isArray(complianceProfile)) {
    for (const flag of complianceProfile) {
      if (typeof flag !== 'string') continue;
      const mode = PROFILE_FLAG_TO_MODE[flag.toLowerCase().trim()];
      if (mode) found.add(mode);
    }
  }

  // Order-stable output (matches ALL_MODES). Easier to assert against in
  // tests and avoids "set iteration order" foot-guns at callers.
  return ALL_MODES.filter((m) => found.has(m));
}

/**
 * Look up an entity by id and derive its compliance modes. Returns an
 * empty array when the entity is missing, when it has no compliance
 * markers, or when the prisma call fails — the caller should treat an
 * empty array as "no special compliance mode" and proceed normally.
 */
export async function deriveEntityCompliance(
  entityId: string | null | undefined
): Promise<ComplianceMode[]> {
  if (!entityId) return [];

  let row: { type: string; complianceProfile: string[] } | null = null;
  try {
    row = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { type: true, complianceProfile: true },
    });
  } catch (err) {
    // Best-effort: never block the voice path on a compliance lookup
    // failure. The default (no compliance flag) is the safest fallback
    // — VAF will run unflagged STT, which still works for non-PHI
    // content.
    console.warn('[deriveEntityCompliance] prisma lookup failed:', err);
    return [];
  }

  if (!row) return [];
  return computeEntityCompliance(row.type, row.complianceProfile);
}
