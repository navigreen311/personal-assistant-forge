// Mock the prisma client and the tasks engine before importing the
// processor — both are pulled in at module load time.

const mockEventFindUniqueOrThrow = jest.fn();
const mockEventUpdate = jest.fn();
const mockCreateTask = jest.fn();
const mockCreateEntry = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    calendarEvent: {
      findUniqueOrThrow: (...args: unknown[]) => mockEventFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => mockEventUpdate(...args),
    },
  },
}));

jest.mock('@/modules/tasks/services/task-crud', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
}));

jest.mock('@/modules/decisions/services/decision-journal', () => ({
  createEntry: (...args: unknown[]) => mockCreateEntry(...args),
}));

import { MeetingProcessor } from '../processor';
import type { MeetingTranscript } from '@/lib/vaf/meeting-intel-client';
import { VAFMeetingIntelligence } from '@/lib/vaf/meeting-intel-client';

describe('MeetingProcessor', () => {
  beforeEach(() => {
    mockEventFindUniqueOrThrow.mockReset();
    mockEventUpdate.mockReset();
    mockCreateTask.mockReset();
    mockCreateEntry.mockReset();
    // Default: createEntry succeeds with a synthetic id. Tests that care
    // can override per-call.
    mockCreateEntry.mockImplementation(async () => ({
      id: `journal-${mockCreateEntry.mock.calls.length}`,
    }));
  });

  const fixture: MeetingTranscript = {
    segments: [],
    summary: 'We agreed on Q3 staffing changes.',
    actionItems: [
      {
        description: 'Send compliance package to Dr. Martinez',
        assignee: 'Ivan',
        deadline: '2026-05-02T00:00:00.000Z',
        priority: 'high',
      },
      {
        description: 'Review TB clearance roster',
        assignee: 'Maria',
        priority: 'medium',
      },
      {
        description: 'Archive old meeting notes',
        assignee: 'Ivan',
        priority: 'low',
      },
    ],
    decisions: [
      {
        decision: 'Postpone vendor onboarding to Q4',
        madeBy: 'Ivan',
        context: 'budget cycle',
      },
    ],
    keyTopics: ['compliance', 'staffing'],
    duration: 1800,
    speakerCount: 2,
  };

  it('applyTranscript creates tasks per action item with mapped priority', async () => {
    mockEventUpdate.mockResolvedValue({ id: 'evt-1' });
    mockCreateTask
      .mockResolvedValueOnce({ id: 'task-1' })
      .mockResolvedValueOnce({ id: 'task-2' })
      .mockResolvedValueOnce({ id: 'task-3' });

    const intelStub = { processRecording: jest.fn() } as unknown as VAFMeetingIntelligence;
    const processor = new MeetingProcessor(intelStub);

    const out = await processor.applyTranscript('evt-1', 'entity-1', fixture);

    expect(mockCreateTask).toHaveBeenCalledTimes(3);

    const firstCall = mockCreateTask.mock.calls[0][0];
    expect(firstCall.title).toBe('Send compliance package to Dr. Martinez');
    expect(firstCall.entityId).toBe('entity-1');
    expect(firstCall.priority).toBe('P0');
    expect(firstCall.dueDate).toBeInstanceOf(Date);
    expect(firstCall.createdFrom).toEqual({ type: 'MEETING', sourceId: 'evt-1' });

    expect(mockCreateTask.mock.calls[1][0].priority).toBe('P1');
    expect(mockCreateTask.mock.calls[2][0].priority).toBe('P2');

    expect(out.tasksCreated).toEqual(['task-1', 'task-2', 'task-3']);
    expect(out.decisionsLogged).toBe(1);
    expect(out.decisionsJournaled).toEqual(['journal-1']);
    expect(out.summaryAttached).toBe(true);
    expect(out.warnings).toEqual([]);
  });

  it('applyTranscript journals each decision via the Decisions module', async () => {
    mockEventUpdate.mockResolvedValue({ id: 'evt-1' });
    mockCreateTask.mockResolvedValue({ id: 'task' });

    const multiDecision: MeetingTranscript = {
      ...fixture,
      decisions: [
        { decision: 'Postpone vendor onboarding to Q4', madeBy: 'Ivan', context: 'budget' },
        { decision: 'Hire compliance lead', madeBy: 'Maria', context: 'staffing' },
      ],
    };

    const intelStub = { processRecording: jest.fn() } as unknown as VAFMeetingIntelligence;
    const processor = new MeetingProcessor(intelStub);

    const out = await processor.applyTranscript('evt-1', 'entity-1', multiDecision);

    expect(mockCreateEntry).toHaveBeenCalledTimes(2);
    const firstArg = mockCreateEntry.mock.calls[0][0];
    expect(firstArg.entityId).toBe('entity-1');
    expect(firstArg.title).toBe('Postpone vendor onboarding to Q4');
    expect(firstArg.chosenOption).toBe('Postpone vendor onboarding to Q4');
    expect(firstArg.rationale).toBe('Captured from meeting transcript');
    expect(firstArg.context).toContain('We agreed on Q3 staffing changes.');
    expect(firstArg.expectedOutcomes).toEqual([]);
    expect(firstArg.optionsConsidered).toEqual([]);
    expect(firstArg.status).toBe('PENDING_REVIEW');
    expect(firstArg.reviewDate).toBeInstanceOf(Date);

    expect(out.decisionsLogged).toBe(2);
    expect(out.decisionsJournaled).toEqual(['journal-1', 'journal-2']);
  });

  it('applyTranscript surfaces journal failures as warnings without failing the pipeline', async () => {
    mockEventUpdate.mockResolvedValue({ id: 'evt-1' });
    mockCreateTask.mockResolvedValue({ id: 'task' });
    mockCreateEntry.mockReset();
    mockCreateEntry.mockRejectedValueOnce(new Error('journal db down'));

    const intelStub = { processRecording: jest.fn() } as unknown as VAFMeetingIntelligence;
    const processor = new MeetingProcessor(intelStub);

    const out = await processor.applyTranscript('evt-1', 'entity-1', fixture);

    expect(out.decisionsJournaled).toEqual([]);
    expect(out.warnings.some((w) => w.includes('journal db down'))).toBe(true);
    // Tasks + summary still landed.
    expect(out.summaryAttached).toBe(true);
    expect(out.tasksCreated.length).toBeGreaterThan(0);
  });

  it('applyTranscript writes a summary block back to the calendar event', async () => {
    mockEventUpdate.mockResolvedValue({ id: 'evt-1' });
    mockCreateTask.mockResolvedValue({ id: 'task' });

    const intelStub = { processRecording: jest.fn() } as unknown as VAFMeetingIntelligence;
    const processor = new MeetingProcessor(intelStub);

    await processor.applyTranscript('evt-1', 'entity-1', fixture);

    expect(mockEventUpdate).toHaveBeenCalledTimes(1);
    const arg = mockEventUpdate.mock.calls[0][0];
    expect(arg.where.id).toBe('evt-1');
    expect(arg.data.meetingNotes).toContain('## Meeting Summary');
    expect(arg.data.meetingNotes).toContain('We agreed on Q3 staffing changes.');
    expect(arg.data.meetingNotes).toContain('## Decisions');
    expect(arg.data.meetingNotes).toContain('Postpone vendor onboarding to Q4');
  });

  it('applyTranscript surfaces task creation failures as warnings', async () => {
    mockEventUpdate.mockResolvedValue({ id: 'evt-1' });
    mockCreateTask
      .mockResolvedValueOnce({ id: 'task-1' })
      .mockRejectedValueOnce(new Error('entity not found'))
      .mockResolvedValueOnce({ id: 'task-3' });

    const intelStub = { processRecording: jest.fn() } as unknown as VAFMeetingIntelligence;
    const processor = new MeetingProcessor(intelStub);

    const out = await processor.applyTranscript('evt-1', 'entity-1', fixture);

    expect(out.tasksCreated).toEqual(['task-1', 'task-3']);
    expect(out.warnings.some((w) => w.includes('entity not found'))).toBe(true);
  });

  it('processEvent fetches the recording URL via prisma and runs the pipeline', async () => {
    mockEventFindUniqueOrThrow.mockResolvedValue({
      id: 'evt-1',
      entityId: 'entity-9',
      recordingUrl: 'https://r.example/audio.mp3',
      meetingNotes: 'Discussion topics.',
    });
    mockEventUpdate.mockResolvedValue({ id: 'evt-1' });

    const intelStub = {
      processRecording: jest.fn().mockResolvedValue(fixture),
    } as unknown as VAFMeetingIntelligence;

    const processor = new MeetingProcessor(intelStub);
    mockCreateTask.mockResolvedValue({ id: 'task' });

    await processor.processEvent({ eventId: 'evt-1' });

    expect(intelStub.processRecording).toHaveBeenCalledWith(
      'https://r.example/audio.mp3',
      undefined
    );
  });
});
