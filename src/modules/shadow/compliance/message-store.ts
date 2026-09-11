// ============================================================================
// Shadow Voice Agent — the one way a message reaches the database
// ============================================================================
//
// P-17 (Sprint 6), v3 Addition 9.2 ("Redaction Before Indexing", P0).
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG
// ---------------------------------------------------------------------------
//
// `compliance/redaction.ts` opens with the comment "Every transcript passes
// through this BEFORE storage." It had ZERO external importers. The only
// mentions of it anywhere in `src/` were the two re-export lines in
// `compliance/index.ts`. Nothing called `redact()`, so nothing was redacted,
// so every transcript, every voice turn and every chat message went into
// Postgres verbatim — including the SSNs, card numbers, CVVs and API keys the
// pipeline was written to catch, and including PHI on entities tagged HIPAA.
//
// That is this codebase's second failure mode: a module that is imported and
// whose functions nobody calls. `tests/unit/shadow/compliance.test.ts` has 30+
// green tests over `RedactionPipeline` and could not have detected it, because
// it constructs the pipeline itself.
//
// ---------------------------------------------------------------------------
// WHY A CHOKEPOINT AND NOT SIX CALL SITES
// ---------------------------------------------------------------------------
//
// `prisma.shadowMessage.create` appeared in six places: `agent/memory.ts`,
// `interfaces/web-chat.ts`, `interfaces/voice-in-app.ts` (twice),
// `api/shadow/chat/route.ts` (twice) and `api/shadow/action/route.ts`. Adding a
// `redact()` call to each would leave the seventh writer — the one somebody
// adds next month — storing raw PII, and nothing would say so.
//
// So this module is the only writer, and `eslint.config.mjs` forbids
// `prisma.shadowMessage.create` anywhere else. The next person to add a write
// path gets a lint error rather than a silent compliance failure. That is the
// same mechanism P-34 used to keep `@/lib/db` out of `tool-router.ts`, for the
// same reason: a rule a reviewer has to remember is a rule that fails.
//
// ---------------------------------------------------------------------------
// WHICH PATTERNS APPLY
// ---------------------------------------------------------------------------
//
// `RedactionPipeline.redact(text, profiles)` always applies SSN, credit card,
// CVV and credential patterns, and applies the PHI and GDPR-personal-data
// patterns only when the entity carries the matching compliance profile. The
// profiles come from the SESSION'S ENTITY (`Entity.complianceProfile`), read
// here rather than passed in, because the caller that knows the message also
// has no business deciding which compliance regime applies to it.
//
// A session with no entity gets the universal patterns only. That is the
// spec's behaviour (`redactTranscript(text, entityCompliance)` with an empty
// list) and it is the safe direction: PHI redaction on a non-HIPAA entity would
// silently mangle ordinary business text, and the MEDICAL pattern is broad
// enough ("surgery", "MRI", "cancer") that it would do so often.
//
// ---------------------------------------------------------------------------
// THE REDACTION LOG
// ---------------------------------------------------------------------------
//
// Addition 9.2 asks for one: "Redaction log tracks what was removed and why."
// There is no table for it and `prisma/schema.prisma` is frozen, so what a
// redacted message carries is the TYPES and POSITIONS of what was removed,
// under `telemetry.redactions` — never the original values, which would put the
// card number back in the database in a different column and make this whole
// module theatre. `PARALLEL_BUILD_ESCALATION_P17.md` asks for the table.
//
// `telemetry` is written ONLY when something was actually redacted. A message
// that needed no redaction keeps whatever telemetry its caller passed,
// including `null` — `tests/db/shadow-persona-calls.test.ts` distinguishes the
// agent's assistant row from the chat route's copy by which one has telemetry,
// and a module that started stamping telemetry onto every row would quietly
// break that selector.
// ============================================================================

import { prisma } from '@/lib/db';
import { computeEntityCompliance } from '@/lib/shadow/compliance/entity-compliance';
import { redactionPipeline, type RedactionEntry } from './redaction';

/** What a caller may store. Mirrors the columns the six call sites used. */
export interface StoreShadowMessageParams {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType?: string;
  intent?: string | null;
  toolsUsed?: unknown[];
  actionsTaken?: unknown[];
  channel: string;
  confidence?: number | null;
  latencyMs?: number | null;
  telemetry?: Record<string, unknown> | null;
  sttProvider?: string | null;
  ttsProvider?: string | null;
  audioQuality?: unknown;
  /**
   * Compliance profiles to redact against, when the caller already has them.
   * Omitted by every production call site; it exists so the agent can pass the
   * persona profiles it resolved for the turn rather than making this module
   * repeat the query.
   */
  complianceProfiles?: string[];
}

export interface StoredShadowMessage {
  id: string;
  /** The content AS STORED. Redacted if anything matched. */
  content: string;
  /** What was removed. Types and positions only — never the original values. */
  redactions: Array<{ type: string; position: [number, number] }>;
}

/**
 * The compliance profiles in force for a session.
 *
 * Returns `[]` for a session with no entity, an entity with no profiles, or a
 * session id that does not resolve — the last of which is not an error here:
 * `voice-in-app.ts` checks for the session's existence itself and the FK
 * enforces it on write, so the only outcome of a bad id is that the create
 * below throws, which is what it did before this module existed.
 */
async function complianceProfilesForSession(sessionId: string): Promise<string[]> {
  const session = await prisma.shadowVoiceSession.findUnique({
    where: { id: sessionId },
    select: { entity: { select: { type: true, complianceProfile: true } } },
  });
  if (!session?.entity) return [];

  // `computeEntityCompliance` rather than the raw `complianceProfile` array,
  // because it is the platform's existing normaliser and it derives HIPAA from
  // the entity's TYPE as well as from its flags: an entity typed
  // "Medical Practice" whose owner never filled in a compliance profile still
  // gets PHI redaction. Reusing it also means redaction and the VAF STT mode
  // (`voice-in-app.ts`) cannot drift into disagreeing about what a HIPAA entity
  // is. It returns 'HIPAA' | 'PCI' | 'GDPR', which is exactly the vocabulary
  // `redaction.ts` matches `requiredProfiles` against.
  return computeEntityCompliance(session.entity.type, session.entity.complianceProfile);
}

/** Strip the original values out of a redaction entry. */
function toLogEntry(entry: RedactionEntry): { type: string; position: [number, number] } {
  return { type: entry.type, position: entry.position };
}

/**
 * Redact and store one Shadow message.
 *
 * The ONLY permitted writer of `ShadowMessage`. See the header, and
 * `eslint.config.mjs` for the rule that enforces it.
 */
export async function storeShadowMessage(
  params: StoreShadowMessageParams,
): Promise<StoredShadowMessage> {
  const profiles =
    params.complianceProfiles ?? (await complianceProfilesForSession(params.sessionId));

  const { redactedText, redactions } = redactionPipeline.redact(params.content, profiles);

  const log = redactions.map(toLogEntry);
  const telemetry =
    log.length > 0
      ? { ...(params.telemetry ?? {}), redactions: log }
      : (params.telemetry ?? null);

  const created = await prisma.shadowMessage.create({
    data: {
      sessionId: params.sessionId,
      role: params.role,
      content: redactedText,
      contentType: params.contentType ?? 'TEXT',
      intent: params.intent ?? null,
      toolsUsed: (params.toolsUsed ?? []) as Parameters<
        typeof prisma.shadowMessage.create
      >[0]['data']['toolsUsed'],
      actionsTaken: (params.actionsTaken ?? []) as Parameters<
        typeof prisma.shadowMessage.create
      >[0]['data']['actionsTaken'],
      channel: params.channel,
      confidence: params.confidence ?? null,
      latencyMs: params.latencyMs ?? null,
      // Prisma's JSON column rejects `Record<string, unknown>` directly because
      // `unknown` values could be non-serialisable. The payload is always a
      // shallow JSON-safe object, so it is cast at the boundary — the same cast
      // `memory.ts` carried before this module took the write over.
      telemetry: telemetry as Parameters<
        typeof prisma.shadowMessage.create
      >[0]['data']['telemetry'],
      sttProvider: params.sttProvider ?? null,
      ttsProvider: params.ttsProvider ?? null,
      audioQuality: (params.audioQuality ?? null) as Parameters<
        typeof prisma.shadowMessage.create
      >[0]['data']['audioQuality'],
    },
  });

  return { id: created.id, content: redactedText, redactions: log };
}
