import {
  renderTemplate,
  wrapInLayout,
  getEmailTemplate,
  emailTemplates,
  type WelcomeData,
  type PasswordResetData,
  type TaskReminderData,
  type InvoiceSentData,
  type DailyDigestData,
  type AlertNotificationData,
  type MeetingPrepData,
} from '@/lib/integrations/email/templates';

// ─── renderTemplate ────────────────────────────────────────────────────────────

describe('Email Templates', () => {
  describe('renderTemplate', () => {
    it('should render welcome template with all variables substituted', () => {
      const data: WelcomeData = {
        userName: 'Alice',
        entityName: 'Acme Corp',
        loginUrl: 'https://app.example.com/login',
      };
      const result = renderTemplate(emailTemplates.welcome, data);

      expect(result.subject).toBe('Welcome to Acme Corp!');
      expect(result.html).toContain('Alice');
      expect(result.html).toContain('Acme Corp');
      expect(result.html).toContain('https://app.example.com/login');
      expect(result.text).toContain('Alice');
      expect(result.text).toContain('Acme Corp');
      expect(result.text).toContain('https://app.example.com/login');
    });

    it('should render password-reset template with expiry info', () => {
      const data: PasswordResetData = {
        userName: 'Bob',
        resetUrl: 'https://app.example.com/reset?token=abc',
        expiresInMinutes: 30,
      };
      const result = renderTemplate(emailTemplates.passwordReset, data);

      expect(result.subject).toBe('Reset Your Password');
      expect(result.html).toContain('Bob');
      expect(result.html).toContain('30 minutes');
      expect(result.html).toContain('https://app.example.com/reset?token=abc');
      expect(result.text).toContain('30 minutes');
    });

    it('should render task-reminder template with priority styling', () => {
      const data: TaskReminderData = {
        userName: 'Charlie',
        taskTitle: 'Review PR #42',
        taskPriority: 'high',
        dueDate: '2026-02-20',
        taskUrl: 'https://app.example.com/tasks/42',
        entityName: 'DevTeam',
      };
      const result = renderTemplate(emailTemplates.taskReminder, data);

      expect(result.subject).toContain('Review PR #42');
      expect(result.subject).toContain('2026-02-20');
      expect(result.html).toContain('Charlie');
      expect(result.html).toContain('Review PR #42');
      expect(result.html).toContain('high');
      expect(result.html).toContain('#ea580c'); // high priority color
      expect(result.text).toContain('Priority: high');
    });

    it('should render invoice-sent template with formatted currency', () => {
      const data: InvoiceSentData = {
        recipientName: 'Diana',
        invoiceNumber: 'INV-2026-001',
        amount: '1,250.00',
        currency: 'USD',
        dueDate: '2026-03-01',
        invoiceUrl: 'https://app.example.com/invoices/001',
        entityName: 'BizCo',
      };
      const result = renderTemplate(emailTemplates.invoiceSent, data);

      expect(result.subject).toContain('INV-2026-001');
      expect(result.subject).toContain('BizCo');
      expect(result.html).toContain('Diana');
      expect(result.html).toContain('USD');
      expect(result.html).toContain('1,250.00');
      expect(result.html).toContain('2026-03-01');
      expect(result.text).toContain('USD 1,250.00');
    });

    it('should render daily-digest template with task and meeting lists', () => {
      const data: DailyDigestData = {
        userName: 'Eve',
        date: '2026-02-15',
        entityName: 'StartupX',
        tasksDueToday: [
          { title: 'Write tests', priority: 'high', url: 'https://example.com/t/1' },
          { title: 'Deploy app', priority: 'urgent', url: 'https://example.com/t/2' },
        ],
        upcomingMeetings: [
          { title: 'Standup', time: '9:00 AM', url: 'https://example.com/m/1' },
        ],
        unreadMessages: 5,
        pendingApprovals: 2,
        overdueItems: 1,
      };
      const result = renderTemplate(emailTemplates.dailyDigest, data);

      expect(result.subject).toContain('2026-02-15');
      expect(result.html).toContain('Write tests');
      expect(result.html).toContain('Deploy app');
      expect(result.html).toContain('Standup');
      expect(result.html).toContain('9:00 AM');
      expect(result.html).toContain('5'); // unread messages
      expect(result.text).toContain('Write tests');
      expect(result.text).toContain('Standup');
      expect(result.text).toContain('Unread Messages: 5');
    });

    it('should render daily-digest template gracefully with empty arrays', () => {
      const data: DailyDigestData = {
        userName: 'Frank',
        date: '2026-02-15',
        entityName: 'EmptyOrg',
        tasksDueToday: [],
        upcomingMeetings: [],
        unreadMessages: 0,
        pendingApprovals: 0,
        overdueItems: 0,
      };
      const result = renderTemplate(emailTemplates.dailyDigest, data);

      expect(result.html).toContain('No tasks due today');
      expect(result.html).toContain('No meetings scheduled');
      expect(result.text).toContain('No tasks due today');
      expect(result.text).toContain('No meetings scheduled');
    });

    it('should render alert-notification with correct styling per alert type', () => {
      const baseData: Omit<AlertNotificationData, 'alertType'> = {
        userName: 'Grace',
        title: 'System Alert',
        message: 'Something happened',
        entityName: 'SecureOrg',
        timestamp: '2026-02-15T10:00:00Z',
      };

      // Urgent - red
      const urgent = renderTemplate(emailTemplates.alertNotification, {
        ...baseData,
        alertType: 'urgent' as const,
      });
      expect(urgent.html).toContain('#dc2626'); // red border
      expect(urgent.html).toContain('#fef2f2'); // red bg
      expect(urgent.html).toContain('URGENT');
      expect(urgent.subject).toContain('[URGENT]');

      // Warning - yellow
      const warning = renderTemplate(emailTemplates.alertNotification, {
        ...baseData,
        alertType: 'warning' as const,
      });
      expect(warning.html).toContain('#ca8a04'); // yellow border
      expect(warning.html).toContain('#fffbeb'); // yellow bg
      expect(warning.html).toContain('WARNING');

      // Info - blue
      const info = renderTemplate(emailTemplates.alertNotification, {
        ...baseData,
        alertType: 'info' as const,
      });
      expect(info.html).toContain('#2563eb'); // blue border
      expect(info.html).toContain('#eff6ff'); // blue bg
      expect(info.html).toContain('INFO');
    });

    it('should render meeting-prep template with attendees and agenda', () => {
      const data: MeetingPrepData = {
        userName: 'Hank',
        meetingTitle: 'Q1 Planning',
        meetingTime: '2:00 PM EST',
        attendees: [
          { name: 'Alice', role: 'CEO' },
          { name: 'Bob', role: 'CTO' },
          { name: 'Charlie' },
        ],
        agenda: ['Review Q4 results', 'Set Q1 goals', 'Budget allocation'],
        relatedDocuments: [
          { title: 'Q4 Report', url: 'https://docs.example.com/q4' },
        ],
        entityName: 'CorpInc',
      };
      const result = renderTemplate(emailTemplates.meetingPrep, data);

      expect(result.subject).toContain('Q1 Planning');
      expect(result.subject).toContain('2:00 PM EST');
      expect(result.html).toContain('Alice');
      expect(result.html).toContain('CEO');
      expect(result.html).toContain('Bob');
      expect(result.html).toContain('CTO');
      expect(result.html).toContain('Charlie');
      expect(result.html).toContain('Review Q4 results');
      expect(result.html).toContain('Q4 Report');
      expect(result.text).toContain('Alice (CEO)');
      expect(result.text).toContain('Review Q4 results');
      expect(result.text).toContain('Q4 Report');
    });
  });

  // ─── wrapInLayout ──────────────────────────────────────────────────────────

  describe('wrapInLayout', () => {
    it('should wrap body HTML in header and footer', () => {
      const result = wrapInLayout('<p>Hello</p>');

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<p>Hello</p>');
      expect(result).toContain('Personal Assistant Forge'); // default entity name
      expect(result).toContain('All rights reserved');
    });

    it('should include entity name when provided', () => {
      const result = wrapInLayout('<p>Body</p>', { entityName: 'MyCompany' });

      expect(result).toContain('MyCompany');
    });

    it('should include unsubscribe link when provided', () => {
      const result = wrapInLayout('<p>Body</p>', {
        unsubscribeUrl: 'https://app.example.com/unsub',
      });

      expect(result).toContain('Unsubscribe');
      expect(result).toContain('https://app.example.com/unsub');
    });
  });

  // ─── getEmailTemplate ──────────────────────────────────────────────────────

  describe('getEmailTemplate', () => {
    it('should return template by ID', () => {
      const template = getEmailTemplate('welcome');
      expect(template).toBeDefined();
      expect(template!.id).toBe('welcome');
      expect(template!.name).toBe('Welcome Email');
    });

    it('should return undefined for unknown template ID', () => {
      const template = getEmailTemplate('nonexistent');
      expect(template).toBeUndefined();
    });
  });

  // ─── HTML Safety ───────────────────────────────────────────────────────────

  describe('HTML safety', () => {
    it('should escape HTML entities in user-provided data', () => {
      const data: WelcomeData = {
        userName: '<script>alert("xss")</script>',
        entityName: 'Safe & Sound "Corp"',
        loginUrl: 'https://example.com/?a=1&b=2',
      };
      const result = renderTemplate(emailTemplates.welcome, data);

      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('&lt;script&gt;');
      expect(result.html).toContain('Safe &amp; Sound &quot;Corp&quot;');
    });

    it('should not produce broken HTML tags', () => {
      const data: WelcomeData = {
        userName: 'Normal User',
        entityName: 'Normal Corp',
        loginUrl: 'https://example.com',
      };
      const result = renderTemplate(emailTemplates.welcome, data);

      // Count opening and closing tags for key structural elements
      const openTables = (result.html.match(/<table/g) || []).length;
      const closeTables = (result.html.match(/<\/table>/g) || []).length;
      expect(openTables).toBe(closeTables);

      const openTds = (result.html.match(/<td/g) || []).length;
      const closeTds = (result.html.match(/<\/td>/g) || []).length;
      expect(openTds).toBe(closeTds);
    });
  });
});
