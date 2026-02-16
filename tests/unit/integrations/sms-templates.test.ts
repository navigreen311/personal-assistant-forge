import {
  renderSmsTemplate,
  truncateToSmsLimit,
  getSmsTemplate,
  smsTemplates,
  type VerificationCodeData,
  type TaskAlertData,
  type MeetingReminderData,
  type CrisisAlertData,
} from '@/lib/integrations/sms/templates';
import { calculateSegments } from '@/lib/integrations/sms/workflows';

// ─── renderSmsTemplate ─────────────────────────────────────────────────────────

describe('SMS Templates', () => {
  describe('renderSmsTemplate', () => {
    it('should render verification-code template within character limit', () => {
      const data: VerificationCodeData = {
        code: '123456',
        expiresInMinutes: 10,
      };
      const result = renderSmsTemplate(smsTemplates.verificationCode, data);

      expect(result).toContain('123456');
      expect(result).toContain('10 min');
      expect(result.length).toBeLessThanOrEqual(160);
    });

    it('should render task-alert template with priority and action', () => {
      const data: TaskAlertData = {
        taskTitle: 'Deploy v2.0',
        priority: 'high',
        action: 'is now overdue',
        entityName: 'DevTeam',
      };
      const result = renderSmsTemplate(smsTemplates.taskAlert, data);

      expect(result).toContain('Deploy v2.0');
      expect(result).toContain('HIGH');
      expect(result).toContain('is now overdue');
      expect(result.length).toBeLessThanOrEqual(160);
    });

    it('should render meeting-reminder template with time and location', () => {
      const data: MeetingReminderData = {
        meetingTitle: 'Team Standup',
        startTime: '9:00 AM',
        location: 'Room 301',
        minutesUntil: 15,
      };
      const result = renderSmsTemplate(smsTemplates.meetingReminder, data);

      expect(result).toContain('Team Standup');
      expect(result).toContain('15 min');
      expect(result).toContain('9:00 AM');
      expect(result).toContain('Room 301');
      expect(result.length).toBeLessThanOrEqual(160);
    });

    it('should render crisis-alert template with severity prefix', () => {
      const data: CrisisAlertData = {
        entityName: 'SecureCorp',
        alertLevel: 'critical',
        summary: 'Server down',
        actionRequired: 'Restart immediately',
      };
      const result = renderSmsTemplate(smsTemplates.crisisAlert, data);

      expect(result).toContain('CRITICAL');
      expect(result).toContain('SecureCorp');
      expect(result).toContain('Server down');
      expect(result.length).toBeLessThanOrEqual(160);
    });
  });

  // ─── truncateToSmsLimit ──────────────────────────────────────────────────────

  describe('truncateToSmsLimit', () => {
    it('should not truncate messages within limit', () => {
      const msg = 'Short message';
      expect(truncateToSmsLimit(msg)).toBe(msg);
    });

    it('should truncate and add ellipsis for long messages', () => {
      const msg = 'A'.repeat(200);
      const result = truncateToSmsLimit(msg);

      expect(result.length).toBe(160);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should respect custom maxLength', () => {
      const msg = 'A'.repeat(100);
      const result = truncateToSmsLimit(msg, 50);

      expect(result.length).toBe(50);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  // ─── getSmsTemplate ─────────────────────────────────────────────────────────

  describe('getSmsTemplate', () => {
    it('should return template by ID', () => {
      const template = getSmsTemplate('verification-code');
      expect(template).toBeDefined();
      expect(template!.id).toBe('verification-code');
    });

    it('should return undefined for unknown ID', () => {
      const template = getSmsTemplate('nonexistent');
      expect(template).toBeUndefined();
    });
  });

  // ─── calculateSegments (from workflows) ──────────────────────────────────────

  describe('calculateSegments (from workflows)', () => {
    it('should return 1 for messages under 160 chars (GSM-7)', () => {
      expect(calculateSegments('Hello world')).toBe(1);
      expect(calculateSegments('A'.repeat(160))).toBe(1);
    });

    it('should return 2 for messages between 161-306 chars (GSM-7)', () => {
      expect(calculateSegments('A'.repeat(161))).toBe(2);
      expect(calculateSegments('A'.repeat(306))).toBe(2);
    });

    it('should use UCS-2 limits for messages with unicode characters', () => {
      // Unicode chars → UCS-2 encoding → 70 char limit per segment
      const unicodeMsg = '\u{1F600}'.repeat(35); // 35 emoji = 70 chars (surrogate pairs)
      expect(calculateSegments(unicodeMsg)).toBe(1);

      const longUnicode = '\u{1F600}'.repeat(36); // 36 emoji = 72 chars
      expect(calculateSegments(longUnicode)).toBe(2);
    });

    it('should return 0 for empty messages', () => {
      expect(calculateSegments('')).toBe(0);
    });
  });
});
