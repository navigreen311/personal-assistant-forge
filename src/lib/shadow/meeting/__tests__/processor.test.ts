// Mock the prisma client and the tasks engine before importing the
// processor — both are pulled in at module load time.

const mockEventFindUniqueOrThrow = jest.fn();
const mockEventUpdate = jest.fn();
const mockCreateTask = jest.fn();

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

import { MeetingProcessor } from '../processor';
import type { MeetingTranscript } from '@/lib/vaf/meeting-intel-client';
import { VAFMeetingIntelligence } from '@/lib/vaf/meeting-intel-client';

describe('MeetingProcessor', () => {
  beforeEach(() => {
    mockEventFindUniqueOrThrow.mockReset();
    mockEventUpdate.mockReset();
    mockCreateTask.mockReset();
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
    expect(out.summaryAttached).toBe(true);
    expect(out.warnings).toEqual([]);
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
      meetingNotes: 'Discussion topics. recordingUrl: https://r.example/audio.mp3',
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
