// SMS Templates - Character-limit-aware SMS message templates

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SmsTemplate<TData = Record<string, unknown>> {
  id: string;
  name: string;
  render: (data: TData) => string;
  maxLength: number;
}

export interface VerificationCodeData {
  code: string;
  expiresInMinutes: number;
}

export interface TaskAlertData {
  taskTitle: string;
  priority: string;
  action: string;
  entityName: string;
}

export interface MeetingReminderData {
  meetingTitle: string;
  startTime: string;
  location?: string;
  minutesUntil: number;
}

export interface CrisisAlertData {
  entityName: string;
  alertLevel: 'critical' | 'high' | 'medium';
  summary: string;
  actionRequired: string;
  callbackNumber?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function truncateToSmsLimit(message: string, maxLength: number = 160): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.slice(0, maxLength - 3) + '...';
}

export function renderSmsTemplate<TData>(template: SmsTemplate<TData>, data: TData): string {
  const raw = template.render(data);
  return truncateToSmsLimit(raw, template.maxLength);
}

// ─── Templates ─────────────────────────────────────────────────────────────────

const verificationCodeTemplate: SmsTemplate<VerificationCodeData> = {
  id: 'verification-code',
  name: 'Verification Code',
  maxLength: 160,
  render: (data) =>
    `[PAF] Your code is: ${data.code}. Expires in ${data.expiresInMinutes} min.`,
};

const taskAlertTemplate: SmsTemplate<TaskAlertData> = {
  id: 'task-alert',
  name: 'Task Alert',
  maxLength: 160,
  render: (data) =>
    `[${data.entityName}] ${data.priority.toUpperCase()}: "${data.taskTitle}" ${data.action}.`,
};

const meetingReminderTemplate: SmsTemplate<MeetingReminderData> = {
  id: 'meeting-reminder',
  name: 'Meeting Reminder',
  maxLength: 160,
  render: (data) => {
    const location = data.location ? ` at ${data.location}` : '';
    return `Reminder: "${data.meetingTitle}" in ${data.minutesUntil} min (${data.startTime})${location}.`;
  },
};

const crisisAlertTemplate: SmsTemplate<CrisisAlertData> = {
  id: 'crisis-alert',
  name: 'Crisis Alert',
  maxLength: 160,
  render: (data) => {
    const callback = data.callbackNumber ? ` Call: ${data.callbackNumber}` : '';
    return `${data.alertLevel.toUpperCase()} [${data.entityName}]: ${data.summary}. Action: ${data.actionRequired}.${callback}`;
  },
};

// ─── Template Registry ─────────────────────────────────────────────────────────

export const smsTemplates = {
  verificationCode: verificationCodeTemplate,
  taskAlert: taskAlertTemplate,
  meetingReminder: meetingReminderTemplate,
  crisisAlert: crisisAlertTemplate,
} as const;

// ─── Template Lookup ───────────────────────────────────────────────────────────

const templateById = new Map<string, SmsTemplate>(
  Object.values(smsTemplates).map((t) => [t.id, t as unknown as SmsTemplate])
);

export function getSmsTemplate(templateId: string): SmsTemplate | undefined {
  return templateById.get(templateId);
}
