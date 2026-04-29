// Meeting processor — orchestration helper that takes a calendar event id,
// pulls its recording, runs VAF meeting intelligence, and applies the
// result by:
//   1. attaching the summary back to the calendar event,
//   2. creating tasks for each action item via the existing tasks engine,
//   3. journaling decisions to the Decisions module's createEntry().
//
// WHY (decisions): VAF surfaces only `decision`, `madeBy`, and a thin
// `context` per decision. The Decisions journal expects richer fields
// (rationale, expected outcomes, review date). We default what we can
// (rationale → "Captured from meeting transcript", expectedOutcomes → [],
// reviewDate → +30 days from event end) and skip with a warning if the
// journal call throws — never failing the whole pipeline on a journaling
// hiccup since tasks + summary are the load-bearing outputs.

import { addDays } from 'date-fns';
import { prisma } from '@/lib/db';
import {
  VAFMeetingIntelligence,
  type MeetingTranscript,
  type MeetingProcessOptions,
} from '@/lib/vaf/meeting-intel-client';
import { createTask } from '@/modules/tasks/services/task-crud';
import { createEntry } from '@/modules/decisions/services/decision-journal';
import type { Priority } from '@/shared/types';

export interface ProcessMeetingInput {
  eventId: string;
  audioUrl?: string; // override; otherwise sourced from the calendar event
  options?: MeetingProcessOptions;
}

export interface ProcessMeetingResult {
  eventId: string;
  transcript: MeetingTranscript;
  tasksCreated: string[];
  decisionsLogged: number;
  /** IDs of journal entries created for this meeting's decisions. */
  decisionsJournaled: string[];
  summaryAttached: boolean;
  warnings: string[];
}

// Translate VAF action-item priority → PAF Priority enum.
function mapPriority(p: 'high' | 'medium' | 'low'): Priority {
  switch (p) {
    case 'high':
      return 'P0';
    case 'medium':
      return 'P1';
    case 'low':
    default:
      return 'P2';
  }
}

async function resolveRecordingUrl(
  eventId: string,
  override?: string
): Promise<{ audioUrl: string; entityId: string; endTime: Date | null }> {
  const event = await prisma.calendarEvent.findUniqueOrThrow({
    where: { id: eventId },
  });

  const audioUrl = override ?? event.recordingUrl ?? null;
  if (!audioUrl) {
    throw new Error(
      `No recording URL available for event ${eventId} — pass audioUrl explicitly or set recordingUrl on the event`
    );
  }
  return {
    audioUrl,
    entityId: event.entityId,
    endTime: event.endTime ?? null,
  };
}

export class MeetingProcessor {
  private intel: VAFMeetingIntelligence;

  constructor(intel: VAFMeetingIntelligence = new VAFMeetingIntelligence()) {
    this.intel = intel;
  }

  // Process a calendar event's recording end-to-end.
  async processEvent(input: ProcessMeetingInput): Promise<ProcessMeetingResult> {
    const { audioUrl, entityId, endTime } = await resolveRecordingUrl(
      input.eventId,
      input.audioUrl
    );

    const transcript = await this.intel.processRecording(audioUrl, input.options);
    return this.applyTranscript(input.eventId, entityId, transcript, endTime);
  }

  // Apply an already-fetched transcript to the calendar/tasks/decisions
  // surfaces. Exposed separately so callers can stub out the network
  // round-trip in tests.
  async applyTranscript(
    eventId: string,
    entityId: string,
    transcript: MeetingTranscript,
    meetingEndTime: Date | null = null
  ): Promise<ProcessMeetingResult> {
    const warnings: string[] = [];

    // 1. Attach the summary to the calendar event.
    let summaryAttached = false;
    try {
      const summaryBlock = buildSummaryBlock(transcript);
      await prisma.calendarEvent.update({
        where: { id: eventId },
        data: { meetingNotes: summaryBlock },
      });
      summaryAttached = true;
    } catch (err) {
      warnings.push(`failed to attach summary: ${(err as Error).message}`);
    }

    // 2. Create tasks for each action item.
    const tasksCreated: string[] = [];
    for (const item of transcript.actionItems) {
      try {
        const task = await createTask({
          title: item.description,
          entityId,
          description: item.assignee ? `Assignee: ${item.assignee}` : undefined,
          priority: mapPriority(item.priority),
          dueDate: item.deadline ? new Date(item.deadline) : undefined,
          createdFrom: { type: 'MEETING', sourceId: eventId },
        });
        tasksCreated.push(task.id);
      } catch (err) {
        warnings.push(
          `failed to create task for "${item.description}": ${(err as Error).message}`
        );
      }
    }

    // 3. Decisions: journal each decision via the Decisions module.
    // Best-effort — a failure on a single decision logs a warning and is
    // skipped, never failing the whole pipeline (tasks + summary already
    // landed and matter more than journaling).
    const decisionsLogged = transcript.decisions.length;
    const decisionsJournaled: string[] = [];
    const reviewDate = addDays(meetingEndTime ?? new Date(), 30);
    const contextSnippet = (transcript.summary ?? '').slice(0, 500);

    for (const d of transcript.decisions) {
      try {
        const entry = await createEntry({
          entityId,
          title: d.decision,
          context: contextSnippet,
          optionsConsidered: [],
          chosenOption: d.decision,
          rationale: 'Captured from meeting transcript',
          expectedOutcomes: [],
          reviewDate,
          status: 'PENDING_REVIEW',
        });
        decisionsJournaled.push(entry.id);
      } catch (err) {
        warnings.push(
          `failed to journal decision "${d.decision}": ${(err as Error).message}`
        );
      }
    }

    return {
      eventId,
      transcript,
      tasksCreated,
      decisionsLogged,
      decisionsJournaled,
      summaryAttached,
      warnings,
    };
  }
}

function buildSummaryBlock(t: MeetingTranscript): string {
  const lines: string[] = [];
  lines.push('## Meeting Summary');
  lines.push(t.summary);
  if (t.keyTopics.length > 0) {
    lines.push('');
    lines.push('## Key Topics');
    lines.push(...t.keyTopics.map((k) => `- ${k}`));
  }
  if (t.decisions.length > 0) {
    lines.push('');
    lines.push('## Decisions');
    lines.push(...t.decisions.map((d) => `- ${d.decision} (${d.madeBy})`));
  }
  if (t.actionItems.length > 0) {
    lines.push('');
    lines.push('## Action Items');
    lines.push(
      ...t.actionItems.map(
        (a) => `- [${a.priority}] ${a.description} → ${a.assignee}`
      )
    );
  }
  return lines.join('\n');
}
