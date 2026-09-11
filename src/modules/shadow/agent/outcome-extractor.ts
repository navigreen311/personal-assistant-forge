// Shadow Voice Agent — Outcome Extractor
// Extracts structured outcomes from conversation transcripts using Claude.

import { createMessage, type AiCallAttribution } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { ExtractedOutcome } from '../types';

const EXTRACTION_SYSTEM_PROMPT = `You are an outcome extraction engine. Given a conversation transcript between a user and their AI assistant (Shadow), extract all structured outcomes.

Extract the following categories:
1. **decisionsMade**: Any decisions the user made during the conversation
2. **commitments**: Promises or commitments the user made (to contacts, deadlines, etc.)
3. **deadlinesSet**: Any deadlines or due dates mentioned or created
4. **followUps**: Items that need follow-up action later
5. **recordsCreated**: Any records (tasks, events, contacts, etc.) that were created
6. **recordsUpdated**: Any existing records that were modified
7. **recordsLinked**: Any relationships established between records

Respond with valid JSON only. No markdown, no code fences.

JSON schema:
{
  "decisionsMade": [{ "decision": "string", "context": "string" }],
  "commitments": [{ "commitment": "string", "deadline": "string|null", "assignee": "string|null" }],
  "deadlinesSet": [{ "description": "string", "date": "string" }],
  "followUps": [{ "description": "string", "dueDate": "string|null" }],
  "recordsCreated": [{ "type": "string", "id": "string", "description": "string" }],
  "recordsUpdated": [{ "type": "string", "id": "string", "changes": "string" }],
  "recordsLinked": [{ "fromType": "string", "fromId": "string", "toType": "string", "toId": "string" }]
}

If nothing was found in a category, return an empty array for that category.
Only extract what is clearly stated or directly implied. Do not infer or guess.`;

/** P-39: `UsageRecord.module` for every call this file makes. */
const METERING_MODULE = 'shadow-outcome-extractor';

/**
 * Extract structured outcomes from a conversation transcript.
 *
 * Uses Claude to analyze the full transcript and identify decisions,
 * commitments, deadlines, follow-ups, and record changes.
 *
 * P-39: goes through `createMessage`, not the raw `anthropic` client, so the
 * call lands in the `UsageRecord` ledger. `attribution` is optional here only
 * because a transcript carries no entity of its own; a caller that knows the
 * entity should pass it, and `extractAndSaveOutcomes` threads it through.
 * Without one the call is counted as unattributed rather than silently
 * unmetered.
 */
export async function extractOutcomes(
  transcript: string,
  attribution: AiCallAttribution = { module: METERING_MODULE },
): Promise<ExtractedOutcome> {
  if (!transcript || transcript.trim().length === 0) {
    return emptyOutcome();
  }

  try {
    const response = await createMessage(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        temperature: 0,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract outcomes from this conversation transcript:\n\n${transcript}`,
          },
        ],
      },
      attribution,
    );

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    const parsed = JSON.parse(text) as ExtractedOutcome;

    // Validate structure and provide defaults
    return {
      decisionsMade: Array.isArray(parsed.decisionsMade) ? parsed.decisionsMade : [],
      commitments: Array.isArray(parsed.commitments) ? parsed.commitments : [],
      deadlinesSet: Array.isArray(parsed.deadlinesSet) ? parsed.deadlinesSet : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
      recordsCreated: Array.isArray(parsed.recordsCreated) ? parsed.recordsCreated : [],
      recordsUpdated: Array.isArray(parsed.recordsUpdated) ? parsed.recordsUpdated : [],
      recordsLinked: Array.isArray(parsed.recordsLinked) ? parsed.recordsLinked : [],
    };
  } catch (error) {
    console.error('[ShadowOutcome] Extraction failed:', error);
    return emptyOutcome();
  }
}

/**
 * Save extracted outcomes to the database for a session.
 * Creates a ShadowSessionOutcome record.
 */
export async function saveSessionOutcome(
  sessionId: string,
  outcome: ExtractedOutcome,
  confidence?: number,
): Promise<string> {
  const existing = await prisma.shadowSessionOutcome.findUnique({
    where: { sessionId },
  });

  if (existing) {
    // Update existing outcome record
    await prisma.shadowSessionOutcome.update({
      where: { sessionId },
      data: {
        decisionsMade: outcome.decisionsMade as unknown as import('@prisma/client').Prisma.InputJsonValue,
        commitments: outcome.commitments as unknown as import('@prisma/client').Prisma.InputJsonValue,
        deadlinesSet: outcome.deadlinesSet as unknown as import('@prisma/client').Prisma.InputJsonValue,
        followUps: outcome.followUps as unknown as import('@prisma/client').Prisma.InputJsonValue,
        recordsCreated: outcome.recordsCreated as unknown as import('@prisma/client').Prisma.InputJsonValue,
        recordsUpdated: outcome.recordsUpdated as unknown as import('@prisma/client').Prisma.InputJsonValue,
        recordsLinked: outcome.recordsLinked as unknown as import('@prisma/client').Prisma.InputJsonValue,
        extractionConfidence: confidence ?? null,
      },
    });
    return existing.id;
  }

  const record = await prisma.shadowSessionOutcome.create({
    data: {
      sessionId,
      decisionsMade: outcome.decisionsMade as unknown as import('@prisma/client').Prisma.InputJsonValue,
      commitments: outcome.commitments as unknown as import('@prisma/client').Prisma.InputJsonValue,
      deadlinesSet: outcome.deadlinesSet as unknown as import('@prisma/client').Prisma.InputJsonValue,
      followUps: outcome.followUps as unknown as import('@prisma/client').Prisma.InputJsonValue,
      recordsCreated: outcome.recordsCreated as unknown as import('@prisma/client').Prisma.InputJsonValue,
      recordsUpdated: outcome.recordsUpdated as unknown as import('@prisma/client').Prisma.InputJsonValue,
      recordsLinked: outcome.recordsLinked as unknown as import('@prisma/client').Prisma.InputJsonValue,
      extractionConfidence: confidence ?? null,
    },
  });

  return record.id;
}

/**
 * Extract and save outcomes for a session in one call.
 * Convenience method that combines extraction and persistence.
 */
export async function extractAndSaveOutcomes(
  sessionId: string,
  transcript: string,
  attribution: AiCallAttribution = { module: METERING_MODULE },
): Promise<{ outcome: ExtractedOutcome; outcomeId: string }> {
  const outcome = await extractOutcomes(transcript, attribution);

  // Compute a simple confidence score based on how many items were extracted
  const totalItems =
    outcome.decisionsMade.length +
    outcome.commitments.length +
    outcome.deadlinesSet.length +
    outcome.followUps.length +
    outcome.recordsCreated.length +
    outcome.recordsUpdated.length +
    outcome.recordsLinked.length;

  // Confidence: high if multiple items extracted, lower if few or none
  const confidence = totalItems === 0 ? 0.3 : Math.min(0.95, 0.5 + totalItems * 0.05);

  const outcomeId = await saveSessionOutcome(sessionId, outcome, confidence);

  return { outcome, outcomeId };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyOutcome(): ExtractedOutcome {
  return {
    decisionsMade: [],
    commitments: [],
    deadlinesSet: [],
    followUps: [],
    recordsCreated: [],
    recordsUpdated: [],
    recordsLinked: [],
  };
}
