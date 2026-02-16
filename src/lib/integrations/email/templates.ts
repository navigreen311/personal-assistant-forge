// Email Templates - Typed, renderable email templates with HTML/text output

// ─── HTML Escaping ─────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EmailTemplate<TData = Record<string, unknown>> {
  id: string;
  name: string;
  subject: (data: TData) => string;
  html: (data: TData) => string;
  text: (data: TData) => string;
}

export interface WelcomeData {
  userName: string;
  entityName: string;
  loginUrl: string;
}

export interface PasswordResetData {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface TaskReminderData {
  userName: string;
  taskTitle: string;
  taskPriority: string;
  dueDate: string;
  taskUrl: string;
  entityName: string;
}

export interface InvoiceSentData {
  recipientName: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  dueDate: string;
  invoiceUrl: string;
  entityName: string;
}

export interface DailyDigestData {
  userName: string;
  date: string;
  entityName: string;
  tasksDueToday: Array<{ title: string; priority: string; url: string }>;
  upcomingMeetings: Array<{ title: string; time: string; url: string }>;
  unreadMessages: number;
  pendingApprovals: number;
  overdueItems: number;
}

export interface AlertNotificationData {
  userName: string;
  alertType: 'urgent' | 'warning' | 'info';
  title: string;
  message: string;
  actionUrl?: string;
  entityName: string;
  timestamp: string;
}

export interface MeetingPrepData {
  userName: string;
  meetingTitle: string;
  meetingTime: string;
  attendees: Array<{ name: string; role?: string }>;
  agenda?: string[];
  relatedDocuments?: Array<{ title: string; url: string }>;
  entityName: string;
}

// ─── Layout Wrapper ────────────────────────────────────────────────────────────

export function wrapInLayout(
  bodyHtml: string,
  options?: { entityName?: string; unsubscribeUrl?: string }
): string {
  const entityName = escapeHtml(options?.entityName ?? 'Personal Assistant Forge');
  const unsubscribeLink = options?.unsubscribeUrl
    ? `<a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#999999;text-decoration:underline;">Unsubscribe</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr><td align="center" style="padding:24px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background-color:#2563eb;padding:24px 32px;">
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${entityName}</h1>
</td></tr>
<tr><td style="padding:32px;">
${bodyHtml}
</td></tr>
<tr><td style="background-color:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;">
<p style="margin:0;font-size:12px;color:#999999;">
&copy; ${new Date().getFullYear()} ${entityName}. All rights reserved.
${unsubscribeLink ? `<br>${unsubscribeLink}` : ''}
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Render Helper ─────────────────────────────────────────────────────────────

export function renderTemplate<TData>(
  template: EmailTemplate<TData>,
  data: TData
): { subject: string; html: string; text: string } {
  return {
    subject: template.subject(data),
    html: template.html(data),
    text: template.text(data),
  };
}

// ─── Priority Styling ──────────────────────────────────────────────────────────

function priorityColor(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'urgent':
    case 'critical':
      return '#dc2626';
    case 'high':
      return '#ea580c';
    case 'medium':
      return '#ca8a04';
    case 'low':
      return '#16a34a';
    default:
      return '#6b7280';
  }
}

function alertStyles(alertType: 'urgent' | 'warning' | 'info'): {
  bgColor: string;
  borderColor: string;
  textColor: string;
  label: string;
} {
  switch (alertType) {
    case 'urgent':
      return { bgColor: '#fef2f2', borderColor: '#dc2626', textColor: '#991b1b', label: 'URGENT' };
    case 'warning':
      return { bgColor: '#fffbeb', borderColor: '#ca8a04', textColor: '#92400e', label: 'WARNING' };
    case 'info':
      return { bgColor: '#eff6ff', borderColor: '#2563eb', textColor: '#1e40af', label: 'INFO' };
  }
}

// ─── Templates ─────────────────────────────────────────────────────────────────

const welcomeTemplate: EmailTemplate<WelcomeData> = {
  id: 'welcome',
  name: 'Welcome Email',
  subject: (data) => `Welcome to ${data.entityName}!`,
  html: (data) => {
    const userName = escapeHtml(data.userName);
    const entityName = escapeHtml(data.entityName);
    const loginUrl = escapeHtml(data.loginUrl);
    return wrapInLayout(
      `<h2 style="margin:0 0 16px;color:#1e293b;font-size:24px;">Welcome, ${userName}!</h2>
<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6;">
We're thrilled to have you on board at <strong>${entityName}</strong>. Your account is ready to go.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td style="background-color:#2563eb;border-radius:6px;padding:12px 24px;">
<a href="${loginUrl}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Get Started</a>
</td></tr>
</table>
<p style="margin:0;color:#475569;font-size:14px;">
If the button doesn't work, copy this link: <a href="${loginUrl}" style="color:#2563eb;">${loginUrl}</a>
</p>`,
      { entityName: data.entityName }
    );
  },
  text: (data) =>
    `Welcome, ${data.userName}!\n\nWe're thrilled to have you on board at ${data.entityName}. Your account is ready to go.\n\nGet started: ${data.loginUrl}`,
};

const passwordResetTemplate: EmailTemplate<PasswordResetData> = {
  id: 'password-reset',
  name: 'Password Reset',
  subject: () => 'Reset Your Password',
  html: (data) => {
    const userName = escapeHtml(data.userName);
    const resetUrl = escapeHtml(data.resetUrl);
    return wrapInLayout(
      `<h2 style="margin:0 0 16px;color:#1e293b;font-size:24px;">Password Reset Request</h2>
<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6;">
Hi ${userName}, we received a request to reset your password. Click the button below to set a new password.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td style="background-color:#2563eb;border-radius:6px;padding:12px 24px;">
<a href="${resetUrl}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Reset Password</a>
</td></tr>
</table>
<p style="margin:0 0 8px;color:#475569;font-size:14px;">
This link will expire in <strong>${data.expiresInMinutes} minutes</strong>.
</p>
<p style="margin:0;color:#94a3b8;font-size:13px;">
If you didn't request this, you can safely ignore this email.
</p>`
    );
  },
  text: (data) =>
    `Hi ${data.userName},\n\nWe received a request to reset your password.\n\nReset your password: ${data.resetUrl}\n\nThis link will expire in ${data.expiresInMinutes} minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
};

const taskReminderTemplate: EmailTemplate<TaskReminderData> = {
  id: 'task-reminder',
  name: 'Task Reminder',
  subject: (data) => `Reminder: ${data.taskTitle} is due ${data.dueDate}`,
  html: (data) => {
    const userName = escapeHtml(data.userName);
    const taskTitle = escapeHtml(data.taskTitle);
    const taskPriority = escapeHtml(data.taskPriority);
    const dueDate = escapeHtml(data.dueDate);
    const taskUrl = escapeHtml(data.taskUrl);
    const pColor = priorityColor(data.taskPriority);
    return wrapInLayout(
      `<h2 style="margin:0 0 16px;color:#1e293b;font-size:24px;">Task Reminder</h2>
<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6;">
Hi ${userName}, this is a reminder about an upcoming task.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:16px 0;">
<tr><td style="padding:20px;">
<p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#1e293b;">${taskTitle}</p>
<p style="margin:0 0 4px;font-size:14px;color:#475569;">
Priority: <span style="color:${pColor};font-weight:bold;">${taskPriority}</span>
</p>
<p style="margin:0;font-size:14px;color:#475569;">Due: <strong>${dueDate}</strong></p>
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<tr><td style="background-color:#2563eb;border-radius:6px;padding:12px 24px;">
<a href="${taskUrl}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">View Task</a>
</td></tr>
</table>`,
      { entityName: data.entityName }
    );
  },
  text: (data) =>
    `Hi ${data.userName},\n\nReminder about your task:\n\nTitle: ${data.taskTitle}\nPriority: ${data.taskPriority}\nDue: ${data.dueDate}\n\nView task: ${data.taskUrl}`,
};

const invoiceSentTemplate: EmailTemplate<InvoiceSentData> = {
  id: 'invoice-sent',
  name: 'Invoice Sent',
  subject: (data) => `Invoice ${data.invoiceNumber} from ${data.entityName}`,
  html: (data) => {
    const recipientName = escapeHtml(data.recipientName);
    const invoiceNumber = escapeHtml(data.invoiceNumber);
    const amount = escapeHtml(data.amount);
    const currency = escapeHtml(data.currency);
    const dueDate = escapeHtml(data.dueDate);
    const invoiceUrl = escapeHtml(data.invoiceUrl);
    return wrapInLayout(
      `<h2 style="margin:0 0 16px;color:#1e293b;font-size:24px;">Invoice ${invoiceNumber}</h2>
<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6;">
Hi ${recipientName}, an invoice has been sent to you.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:16px 0;">
<tr><td style="padding:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:8px 0;font-size:14px;color:#64748b;">Invoice Number</td>
<td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:bold;text-align:right;">${invoiceNumber}</td>
</tr>
<tr>
<td style="padding:8px 0;font-size:14px;color:#64748b;">Amount</td>
<td style="padding:8px 0;font-size:20px;color:#1e293b;font-weight:bold;text-align:right;">${currency} ${amount}</td>
</tr>
<tr>
<td style="padding:8px 0;font-size:14px;color:#64748b;">Due Date</td>
<td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:bold;text-align:right;">${dueDate}</td>
</tr>
</table>
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<tr><td style="background-color:#2563eb;border-radius:6px;padding:12px 24px;">
<a href="${invoiceUrl}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">View Invoice</a>
</td></tr>
</table>`,
      { entityName: data.entityName }
    );
  },
  text: (data) =>
    `Hi ${data.recipientName},\n\nAn invoice has been sent to you.\n\nInvoice: ${data.invoiceNumber}\nAmount: ${data.currency} ${data.amount}\nDue: ${data.dueDate}\n\nView invoice: ${data.invoiceUrl}`,
};

const dailyDigestTemplate: EmailTemplate<DailyDigestData> = {
  id: 'daily-digest',
  name: 'Daily Digest',
  subject: (data) => `Your Daily Digest for ${data.date}`,
  html: (data) => {
    const userName = escapeHtml(data.userName);
    const date = escapeHtml(data.date);

    const tasksHtml =
      data.tasksDueToday.length > 0
        ? data.tasksDueToday
            .map(
              (t) =>
                `<tr>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">
<a href="${escapeHtml(t.url)}" style="color:#2563eb;text-decoration:none;font-size:14px;">${escapeHtml(t.title)}</a>
</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">
<span style="color:${priorityColor(t.priority)};font-size:12px;font-weight:bold;">${escapeHtml(t.priority)}</span>
</td>
</tr>`
            )
            .join('')
        : `<tr><td style="padding:12px;color:#94a3b8;font-size:14px;" colspan="2">No tasks due today.</td></tr>`;

    const meetingsHtml =
      data.upcomingMeetings.length > 0
        ? data.upcomingMeetings
            .map(
              (m) =>
                `<tr>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">
<a href="${escapeHtml(m.url)}" style="color:#2563eb;text-decoration:none;font-size:14px;">${escapeHtml(m.title)}</a>
</td>
<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;color:#475569;">${escapeHtml(m.time)}</td>
</tr>`
            )
            .join('')
        : `<tr><td style="padding:12px;color:#94a3b8;font-size:14px;" colspan="2">No meetings scheduled.</td></tr>`;

    return wrapInLayout(
      `<h2 style="margin:0 0 16px;color:#1e293b;font-size:24px;">Daily Digest</h2>
<p style="margin:0 0 24px;color:#475569;font-size:16px;">Hi ${userName}, here's your summary for <strong>${date}</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
<tr>
<td style="width:33%;text-align:center;padding:12px;background-color:#eff6ff;border-radius:8px 0 0 8px;">
<p style="margin:0;font-size:24px;font-weight:bold;color:#2563eb;">${data.unreadMessages}</p>
<p style="margin:4px 0 0;font-size:12px;color:#64748b;">Unread Messages</p>
</td>
<td style="width:34%;text-align:center;padding:12px;background-color:#eff6ff;">
<p style="margin:0;font-size:24px;font-weight:bold;color:#ca8a04;">${data.pendingApprovals}</p>
<p style="margin:4px 0 0;font-size:12px;color:#64748b;">Pending Approvals</p>
</td>
<td style="width:33%;text-align:center;padding:12px;background-color:#eff6ff;border-radius:0 8px 8px 0;">
<p style="margin:0;font-size:24px;font-weight:bold;color:#dc2626;">${data.overdueItems}</p>
<p style="margin:4px 0 0;font-size:12px;color:#64748b;">Overdue Items</p>
</td>
</tr>
</table>
<h3 style="margin:24px 0 12px;color:#1e293b;font-size:16px;">Tasks Due Today</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
${tasksHtml}
</table>
<h3 style="margin:24px 0 12px;color:#1e293b;font-size:16px;">Upcoming Meetings</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
${meetingsHtml}
</table>`,
      { entityName: data.entityName }
    );
  },
  text: (data) => {
    const tasks =
      data.tasksDueToday.length > 0
        ? data.tasksDueToday.map((t) => `  - [${t.priority}] ${t.title} (${t.url})`).join('\n')
        : '  No tasks due today.';
    const meetings =
      data.upcomingMeetings.length > 0
        ? data.upcomingMeetings.map((m) => `  - ${m.time}: ${m.title} (${m.url})`).join('\n')
        : '  No meetings scheduled.';
    return `Hi ${data.userName}, here's your summary for ${data.date}.\n\nUnread Messages: ${data.unreadMessages}\nPending Approvals: ${data.pendingApprovals}\nOverdue Items: ${data.overdueItems}\n\nTasks Due Today:\n${tasks}\n\nUpcoming Meetings:\n${meetings}`;
  },
};

const alertNotificationTemplate: EmailTemplate<AlertNotificationData> = {
  id: 'alert-notification',
  name: 'Alert Notification',
  subject: (data) => `[${data.alertType.toUpperCase()}] ${data.title}`,
  html: (data) => {
    const userName = escapeHtml(data.userName);
    const title = escapeHtml(data.title);
    const message = escapeHtml(data.message);
    const timestamp = escapeHtml(data.timestamp);
    const styles = alertStyles(data.alertType);

    const actionButton = data.actionUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<tr><td style="background-color:${styles.borderColor};border-radius:6px;padding:12px 24px;">
<a href="${escapeHtml(data.actionUrl)}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Take Action</a>
</td></tr>
</table>`
      : '';

    return wrapInLayout(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${styles.bgColor};border-left:4px solid ${styles.borderColor};border-radius:4px;margin:0 0 16px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:${styles.borderColor};text-transform:uppercase;">${styles.label}</p>
<h2 style="margin:0 0 8px;color:${styles.textColor};font-size:20px;">${title}</h2>
<p style="margin:0;color:${styles.textColor};font-size:16px;line-height:1.6;">${message}</p>
</td></tr>
</table>
<p style="margin:0 0 4px;color:#475569;font-size:14px;">Hi ${userName}, this alert was triggered at ${timestamp}.</p>
${actionButton}`,
      { entityName: data.entityName }
    );
  },
  text: (data) => {
    const action = data.actionUrl ? `\nTake action: ${data.actionUrl}` : '';
    return `[${data.alertType.toUpperCase()}] ${data.title}\n\n${data.message}\n\nHi ${data.userName}, this alert was triggered at ${data.timestamp}.${action}`;
  },
};

const meetingPrepTemplate: EmailTemplate<MeetingPrepData> = {
  id: 'meeting-prep',
  name: 'Meeting Preparation',
  subject: (data) => `Prep for: ${data.meetingTitle} at ${data.meetingTime}`,
  html: (data) => {
    const userName = escapeHtml(data.userName);
    const meetingTitle = escapeHtml(data.meetingTitle);
    const meetingTime = escapeHtml(data.meetingTime);

    const attendeesHtml = data.attendees
      .map(
        (a) =>
          `<tr>
<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${escapeHtml(a.name)}</td>
<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#64748b;">${a.role ? escapeHtml(a.role) : ''}</td>
</tr>`
      )
      .join('');

    const agendaHtml =
      data.agenda && data.agenda.length > 0
        ? `<h3 style="margin:20px 0 8px;color:#1e293b;font-size:16px;">Agenda</h3>
<ol style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.8;">
${data.agenda.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
</ol>`
        : '';

    const docsHtml =
      data.relatedDocuments && data.relatedDocuments.length > 0
        ? `<h3 style="margin:20px 0 8px;color:#1e293b;font-size:16px;">Related Documents</h3>
<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;">
${data.relatedDocuments.map((d) => `<li><a href="${escapeHtml(d.url)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(d.title)}</a></li>`).join('')}
</ul>`
        : '';

    return wrapInLayout(
      `<h2 style="margin:0 0 8px;color:#1e293b;font-size:24px;">${meetingTitle}</h2>
<p style="margin:0 0 24px;color:#475569;font-size:16px;">Hi ${userName}, here's your prep for the meeting at <strong>${meetingTime}</strong>.</p>
<h3 style="margin:0 0 8px;color:#1e293b;font-size:16px;">Attendees</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
<tr style="background-color:#f8fafc;">
<td style="padding:8px 12px;font-size:12px;font-weight:bold;color:#64748b;text-transform:uppercase;">Name</td>
<td style="padding:8px 12px;font-size:12px;font-weight:bold;color:#64748b;text-transform:uppercase;">Role</td>
</tr>
${attendeesHtml}
</table>
${agendaHtml}
${docsHtml}`,
      { entityName: data.entityName }
    );
  },
  text: (data) => {
    const attendees = data.attendees
      .map((a) => `  - ${a.name}${a.role ? ` (${a.role})` : ''}`)
      .join('\n');
    const agenda =
      data.agenda && data.agenda.length > 0
        ? `\nAgenda:\n${data.agenda.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}`
        : '';
    const docs =
      data.relatedDocuments && data.relatedDocuments.length > 0
        ? `\nRelated Documents:\n${data.relatedDocuments.map((d) => `  - ${d.title}: ${d.url}`).join('\n')}`
        : '';
    return `Meeting: ${data.meetingTitle}\nTime: ${data.meetingTime}\n\nHi ${data.userName}, here's your prep.\n\nAttendees:\n${attendees}${agenda}${docs}`;
  },
};

// ─── Template Registry ─────────────────────────────────────────────────────────

export const emailTemplates = {
  welcome: welcomeTemplate,
  passwordReset: passwordResetTemplate,
  taskReminder: taskReminderTemplate,
  invoiceSent: invoiceSentTemplate,
  dailyDigest: dailyDigestTemplate,
  alertNotification: alertNotificationTemplate,
  meetingPrep: meetingPrepTemplate,
} as const;

// ─── Template Lookup ───────────────────────────────────────────────────────────

const templateById = new Map<string, EmailTemplate>(
  Object.values(emailTemplates).map((t) => [t.id, t as unknown as EmailTemplate])
);

export function getEmailTemplate(templateId: string): EmailTemplate | undefined {
  return templateById.get(templateId);
}
