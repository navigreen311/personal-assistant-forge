// Meeting processor — orchestration helper that takes a calendar event id,
// pulls its recording, runs VAF meeting intelligence, and applies the
// result by:
//   1. attaching the summary back to the calendar event,
//   2. creating tasks for each action item via the existing tasks engine,
//   3. logging decisions to the Decisions module if available.
//
// WHY: We call directly into the existing `createTask` service (and update
// the calendar event via prisma) rather than re-implementing task / event
// persistence here. Decisions are surfaced as plain entries on the
// returned result so a caller can choose how to journal them — the
// existing `createEntry` API needs richer fields (rationale, expected
// outcomes) than a meeting decision provides, so we leave that wiring
// to the caller and return the decisions verbatim.

import { prisma } from '@/lib/db';
import {
  VAFMeetingIntelligence,
  type MeetingTranscript,
  type MeetingProcessOptions,
} from '@/lib/vaf/meeting-intel-client';
import { createTask } from '@/modules/tasks/services/task-crud';
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

// Resolve the recording URL for a given calendar event. The calendar
// schema doesn't store a dedicated `recordingUrl` column, so callers can
// pass one explicitly or stash it in `meetingNotes` under a
// `recordingUrl:` line. If neither is present we throw.
async function resolveRecordingUrl(
  eventId: string,
  override?: string
): Promise<{ audioUrl: string; entityId: string }> {
  const event = await prisma.calendarEvent.findUniqueOrThrow({
    where: { id: eventId },
  });

  if (override) return { audioUrl: override, entityId: event.entityId };

  const notes = event.meetingNotes ?? '';
  const match = notes.match(/recordingUrl:\s*(\S+)/i);
  if (!match) {
    throw new Error(
      `No recording URL available for event ${eventId} — pass audioUrl explicitly`
    );
  }
  return { audioUrl: match[1], entityId: event.entityId };
}

export class MeetingProcessor {
  private intel: VAFMeetingIntelligence;

  constructor(intel: VAFMeetingIntelligence = new VAFMeetingIntelligence()) {
    this.intel = intel;
  }

  // Process a calendar event's recording end-to-end.
  async processEvent(input: ProcessMeetingInput): Promise<ProcessMeetingResult> {
    const { audioUrl, entityId } = await resolveRecordingUrl(
      input.eventId,
      input.audioUrl
    );

    const transcript = await this.intel.processRecording(audioUrl, input.options);
    return this.applyTranscript(input.eventId, entityId, transcript);
  }

  // Apply an already-fetched transcript to the calendar/tasks/decisions
  // surfaces. Exposed separately so callers can stub out the network
  // round-trip in tests.
  async applyTranscript(
    eventId: string,
    entityId: string,
    transcript: MeetingTranscript
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

    // 3. Decisions: surface count for caller. See WHY note at top of file.
    const decisionsLogged = transcript.decisions.length;

    return {
      eventId,
      transcript,
      tasksCreated,
      decisionsLogged,
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
