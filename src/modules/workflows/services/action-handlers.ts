// ============================================================================
// Action Node Handlers
// Implements handlers for each ActionType with Zod validation
// ============================================================================

import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { ActionType } from '@/modules/workflows/types';

// --- Validation Schemas ---

const sendMessageSchema = z.object({
  channel: z.string().min(1),
  recipientId: z.string().min(1),
  entityId: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1),
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  entityId: z.string().min(1),
  priority: z.string().default('P1'),
  dueDate: z.string().optional(),
  projectId: z.string().optional(),
  description: z.string().optional(),
});

const updateRecordSchema = z.object({
  model: z.string().min(1),
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

const generateDocumentSchema = z.object({
  title: z.string().min(1),
  entityId: z.string().min(1),
  type: z.string().min(1),
  templateId: z.string().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

const callApiSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  timeout: z.number().positive().optional(),
});

const triggerAiAnalysisSchema = z.object({
  prompt: z.string().min(1),
  data: z.unknown(),
});

const sendNotificationSchema = z.object({
  userId: z.string().min(1),
  message: z.string().min(1),
  channel: z.string().default('IN_APP'),
});

const createEventSchema = z.object({
  title: z.string().min(1),
  entityId: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  participantIds: z.array(z.string()).optional(),
});

const updateContactSchema = z.object({
  contactId: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

const logFinancialSchema = z.object({
  entityId: z.string().min(1),
  type: z.string().min(1),
  amount: z.number(),
  category: z.string().min(1),
  currency: z.string().default('USD'),
  vendor: z.string().optional(),
  description: z.string().optional(),
});

// --- Audit Logger Helper ---

async function logAction(
  actionType: string,
  target: string,
  reason: string,
  blastRadius: string = 'LOW'
): Promise<void> {
  await prisma.actionLog.create({
    data: {
      actor: 'SYSTEM',
      actionType,
      target,
      reason,
      blastRadius,
      reversible: true,
      status: 'EXECUTED',
    },
  });
}

// --- Handler Implementations ---

export async function handleSendMessage(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = sendMessageSchema.parse(params);

  const message = await prisma.message.create({
    data: {
      channel: validated.channel,
      senderId: 'SYSTEM',
      recipientId: validated.recipientId,
      entityId: validated.entityId,
      subject: validated.subject,
      body: validated.body,
      triageScore: 5,
      sensitivity: 'INTERNAL',
    },
  });

  await logAction(
    'SEND_MESSAGE',
    `message:${message.id}`,
    `Sent message to ${validated.recipientId} via ${validated.channel}`
  );

  return { messageId: message.id, channel: validated.channel, status: 'SENT' };
}

export async function handleCreateTask(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = createTaskSchema.parse(params);

  const task = await prisma.task.create({
    data: {
      title: validated.title,
      entityId: validated.entityId,
      priority: validated.priority,
      dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
      projectId: validated.projectId,
      description: validated.description,
      status: 'TODO',
    },
  });

  await logAction(
    'CREATE_TASK',
    `task:${task.id}`,
    `Created task: ${validated.title}`,
    'MEDIUM'
  );

  return { taskId: task.id, title: validated.title, status: 'TODO' };
}

export async function handleUpdateRecord(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = updateRecordSchema.parse(params);

  // Allowlist of models that can be updated
  const allowedModels = ['contact', 'task', 'project', 'document', 'workflow'] as const;
  type AllowedModel = typeof allowedModels[number];

  if (!allowedModels.includes(validated.model as AllowedModel)) {
    throw new Error(`Model ${validated.model} is not allowed for generic update`);
  }

  const modelDelegate = prisma[validated.model as AllowedModel] as {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string }>;
  };

  const updated = await modelDelegate.update({
    where: { id: validated.id },
    data: validated.data,
  });

  await logAction(
    'UPDATE_RECORD',
    `${validated.model}:${validated.id}`,
    `Updated ${validated.model} record`,
    'MEDIUM'
  );

  return { model: validated.model, id: updated.id, updated: true };
}

export async function handleGenerateDocument(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = generateDocumentSchema.parse(params);

  const content = validated.variables
    ? `Generated from template ${validated.templateId ?? 'default'} with variables: ${JSON.stringify(validated.variables)}`
    : `Generated document: ${validated.title}`;

  const document = await prisma.document.create({
    data: {
      title: validated.title,
      entityId: validated.entityId,
      type: validated.type,
      templateId: validated.templateId,
      content,
      status: 'DRAFT',
    },
  });

  await logAction(
    'GENERATE_DOCUMENT',
    `document:${document.id}`,
    `Generated document: ${validated.title}`,
    'LOW'
  );

  return { documentId: document.id, title: validated.title, status: 'DRAFT' };
}

export async function handleCallAPI(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = callApiSchema.parse(params);
  const timeout = validated.timeout ?? 30000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(validated.url, {
      method: validated.method,
      headers: validated.headers as Record<string, string> | undefined,
      body: validated.body ? JSON.stringify(validated.body) : undefined,
      signal: controller.signal,
    });

    const responseData = await response.text();
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(responseData);
    } catch {
      parsedData = responseData;
    }

    await logAction(
      'CALL_API',
      validated.url,
      `API call ${validated.method} ${validated.url} → ${response.status}`
    );

    return {
      status: response.status,
      statusText: response.statusText,
      data: parsedData,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function handleTriggerAIAnalysis(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = triggerAiAnalysisSchema.parse(params);

  // Placeholder: In production, this would call an LLM API (OpenAI, Anthropic, etc.)
  // Example integration point:
  // const response = await openai.chat.completions.create({
  //   model: 'gpt-4',
  //   messages: [{ role: 'user', content: validated.prompt }],
  // });

  const mockResult = {
    analysis: `AI analysis of provided data based on prompt: "${validated.prompt}"`,
    confidence: 0.85,
    insights: ['Insight 1: Data patterns detected', 'Insight 2: Anomalies identified'],
    recommendation: 'Continue monitoring with adjusted parameters',
  };

  await logAction(
    'TRIGGER_AI_ANALYSIS',
    'ai-analysis',
    `AI analysis triggered with prompt: ${validated.prompt.substring(0, 100)}`,
    'LOW'
  );

  return mockResult;
}

export async function handleSendNotification(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = sendNotificationSchema.parse(params);

  // Placeholder: In production, this would dispatch to a notification service
  // (push notifications, email, Slack, etc.)

  await logAction(
    'SEND_NOTIFICATION',
    `user:${validated.userId}`,
    `Notification sent via ${validated.channel}: ${validated.message.substring(0, 100)}`,
    'LOW'
  );

  return {
    userId: validated.userId,
    channel: validated.channel,
    delivered: true,
    timestamp: new Date().toISOString(),
  };
}

export async function handleCreateEvent(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = createEventSchema.parse(params);

  const event = await prisma.calendarEvent.create({
    data: {
      title: validated.title,
      entityId: validated.entityId,
      startTime: new Date(validated.startTime),
      endTime: new Date(validated.endTime),
      participantIds: validated.participantIds ?? [],
    },
  });

  await logAction(
    'CREATE_EVENT',
    `event:${event.id}`,
    `Created calendar event: ${validated.title}`,
    'MEDIUM'
  );

  return { eventId: event.id, title: validated.title, startTime: validated.startTime };
}

export async function handleUpdateContact(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = updateContactSchema.parse(params);

  const contact = await prisma.contact.update({
    where: { id: validated.contactId },
    data: validated.data,
  });

  await logAction(
    'UPDATE_CONTACT',
    `contact:${contact.id}`,
    `Updated contact: ${contact.name}`,
    'MEDIUM'
  );

  return { contactId: contact.id, name: contact.name, updated: true };
}

export async function handleLogFinancial(
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const validated = logFinancialSchema.parse(params);

  const record = await prisma.financialRecord.create({
    data: {
      entityId: validated.entityId,
      type: validated.type,
      amount: validated.amount,
      currency: validated.currency,
      category: validated.category,
      vendor: validated.vendor,
      description: validated.description,
      status: 'PENDING',
    },
  });

  await logAction(
    'LOG_FINANCIAL',
    `financial:${record.id}`,
    `Logged financial record: ${validated.type} $${validated.amount}`,
    'HIGH'
  );

  return { recordId: record.id, type: validated.type, amount: validated.amount };
}

// --- Action Dispatcher ---

const ACTION_HANDLERS: Record<
  ActionType,
  (params: Record<string, unknown>) => Promise<Record<string, unknown>>
> = {
  SEND_MESSAGE: handleSendMessage,
  CREATE_TASK: handleCreateTask,
  UPDATE_RECORD: handleUpdateRecord,
  GENERATE_DOCUMENT: handleGenerateDocument,
  CALL_API: handleCallAPI,
  TRIGGER_AI_ANALYSIS: handleTriggerAIAnalysis,
  SEND_NOTIFICATION: handleSendNotification,
  CREATE_EVENT: handleCreateEvent,
  UPDATE_CONTACT: handleUpdateContact,
  LOG_FINANCIAL: handleLogFinancial,
  EXECUTE_SCRIPT: async (params: Record<string, unknown>) => {
    // Script execution is intentionally a no-op placeholder for security
    await logAction('EXECUTE_SCRIPT', 'script', 'Script execution placeholder', 'CRITICAL');
    return { executed: false, reason: 'Script execution requires explicit enablement', params };
  },
};

export function getActionHandler(
  actionType: ActionType
): (params: Record<string, unknown>) => Promise<Record<string, unknown>> {
  const handler = ACTION_HANDLERS[actionType];
  if (!handler) {
    throw new Error(`No handler registered for action type: ${actionType}`);
  }
  return handler;
}

export async function executeAction(
  actionType: ActionType,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const handler = getActionHandler(actionType);
  return handler(params);
}
