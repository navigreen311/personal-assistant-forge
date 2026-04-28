// ============================================================================
// Tests — POST /api/calendar/[eventId]/post-meeting
// Asserts the auto-process trigger fires when:
//   - vafConfig.autoProcessMeetings === true
//   - calendarEvent.recordingUrl !== null
// And does NOT fire otherwise. The route response must complete successfully
// regardless of whether the processor runs (fire-and-forget).
// ============================================================================

const mockGetToken = jest.fn();
const mockCapturePostMeeting = jest.fn();
const mockGetVafConfig = jest.fn();
const mockProcessEvent = jest.fn();
const mockCalendarEventFindUnique = jest.fn();

jest.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

jest.mock('@/modules/calendar/post-meeting.service', () => ({
  PostMeetingService: jest.fn().mockImplementation(() => ({
    capturePostMeeting: (...args: unknown[]) => mockCapturePostMeeting(...args),
  })),
}));

jest.mock('@/lib/shadow/vaf-config', () => ({
  getVafConfig: (...args: unknown[]) => mockGetVafConfig(...args),
}));

jest.mock('@/lib/shadow/meeting/processor', () => ({
  MeetingProcessor: jest.fn().mockImplementation(() => ({
    processEvent: (...args: unknown[]) => mockProcessEvent(...args),
  })),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    calendarEvent: {
      findUnique: (...args: unknown[]) => mockCalendarEventFindUnique(...args),
    },
  },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/calendar/[eventId]/post-meeting/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_BODY = {
  entityId: 'entity-1',
  notes: 'Discussed Q3 staffing.',
  actionItems: [],
  decisions: [],
  sentiment: 'POSITIVE',
  keyTakeaways: [],
};

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/calendar/evt-1/post-meeting', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const PARAMS = { params: Promise.resolve({ eventId: 'evt-1' }) };

// `flushPromises` runs once after the route resolves so that the
// fire-and-forget `void maybeAutoProcess(...)` callback has a chance to
// execute its async work before assertions. Two ticks covers
// (1) Promise.all for config + event, and (2) processEvent.
async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/calendar/[eventId]/post-meeting', () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockCapturePostMeeting.mockReset();
    mockGetVafConfig.mockReset();
    mockProcessEvent.mockReset();
    mockCalendarEventFindUnique.mockReset();

    mockGetToken.mockResolvedValue({ userId: 'user-1' });
    mockCapturePostMeeting.mockResolvedValue({
      event: { id: 'evt-1' },
      tasksCreated: [],
    });
    mockProcessEvent.mockResolvedValue({});
  });

  it('returns 201 and fires MeetingProcessor when autoProcessMeetings=true and recordingUrl is set', async () => {
    mockGetVafConfig.mockResolvedValue({ autoProcessMeetings: true });
    mockCalendarEventFindUnique.mockResolvedValue({
      recordingUrl: 'https://r.example/audio.mp3',
    });

    const res = await POST(buildRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(201);

    await flushPromises();

    expect(mockProcessEvent).toHaveBeenCalledTimes(1);
    expect(mockProcessEvent).toHaveBeenCalledWith({ eventId: 'evt-1' });
  });

  it('does NOT fire MeetingProcessor when autoProcessMeetings=false', async () => {
    mockGetVafConfig.mockResolvedValue({ autoProcessMeetings: false });
    mockCalendarEventFindUnique.mockResolvedValue({
      recordingUrl: 'https://r.example/audio.mp3',
    });

    const res = await POST(buildRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(201);

    await flushPromises();

    expect(mockProcessEvent).not.toHaveBeenCalled();
  });

  it('does NOT fire MeetingProcessor when recordingUrl is null', async () => {
    mockGetVafConfig.mockResolvedValue({ autoProcessMeetings: true });
    mockCalendarEventFindUnique.mockResolvedValue({ recordingUrl: null });

    const res = await POST(buildRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(201);

    await flushPromises();

    expect(mockProcessEvent).not.toHaveBeenCalled();
  });

  it('does NOT fire MeetingProcessor when the event lookup returns null', async () => {
    mockGetVafConfig.mockResolvedValue({ autoProcessMeetings: true });
    mockCalendarEventFindUnique.mockResolvedValue(null);

    const res = await POST(buildRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(201);

    await flushPromises();

    expect(mockProcessEvent).not.toHaveBeenCalled();
  });

  it('still returns 201 when the auto-process trigger throws', async () => {
    mockGetVafConfig.mockResolvedValue({ autoProcessMeetings: true });
    mockCalendarEventFindUnique.mockResolvedValue({
      recordingUrl: 'https://r.example/audio.mp3',
    });
    mockProcessEvent.mockRejectedValue(new Error('VAF down'));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await POST(buildRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(201);

    await flushPromises();

    warnSpy.mockRestore();
  });

  it('returns 400 on validation error and does not fire MeetingProcessor', async () => {
    mockGetVafConfig.mockResolvedValue({ autoProcessMeetings: true });
    mockCalendarEventFindUnique.mockResolvedValue({
      recordingUrl: 'https://r.example/audio.mp3',
    });

    // Missing required `notes` and others.
    const res = await POST(buildRequest({ entityId: 'entity-1' }), PARAMS);
    expect(res.status).toBe(400);

    await flushPromises();

    expect(mockProcessEvent).not.toHaveBeenCalled();
    expect(mockCapturePostMeeting).not.toHaveBeenCalled();
  });

  it('returns 401 when no auth token is present and does not run anything', async () => {
    mockGetToken.mockResolvedValue(null);

    const res = await POST(buildRequest(VALID_BODY), PARAMS);
    expect(res.status).toBe(401);

    await flushPromises();

    expect(mockCapturePostMeeting).not.toHaveBeenCalled();
    expect(mockProcessEvent).not.toHaveBeenCalled();
  });
});
