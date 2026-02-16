import { z } from 'zod';

export const triageMessageSchema = z.object({
  messageId: z.string().min(1),
  entityId: z.string().min(1),
});

export const batchTriageSchema = z.object({
  entityId: z.string().min(1),
  messageIds: z.array(z.string()).optional(),
  maxMessages: z.number().int().positive().max(200).optional().default(50),
});

export const draftRequestSchema = z.object({
  messageId: z.string().min(1),
  entityId: z.string().min(1),
  tone: z
    .enum([
      'FIRM',
      'DIPLOMATIC',
      'WARM',
      'DIRECT',
      'CASUAL',
      'FORMAL',
      'EMPATHETIC',
      'AUTHORITATIVE',
    ])
    .optional(),
  intent: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  includeDisclaimer: z.boolean().optional(),
  maxLength: z.number().int().positive().optional(),
});

export const refineDraftSchema = z.object({
  draftBody: z.string().min(1),
  feedback: z.string().min(1),
  tone: z
    .enum([
      'FIRM',
      'DIPLOMATIC',
      'WARM',
      'DIRECT',
      'CASUAL',
      'FORMAL',
      'EMPATHETIC',
      'AUTHORITATIVE',
    ])
    .optional(),
});

export const inboxListSchema = z.object({
  entityId: z.string().optional(),
  channel: z
    .enum([
      'EMAIL',
      'SMS',
      'SLACK',
      'TEAMS',
      'DISCORD',
      'WHATSAPP',
      'TELEGRAM',
      'VOICE',
      'MANUAL',
    ])
    .optional(),
  minTriageScore: z.coerce.number().int().min(1).max(10).optional(),
  maxTriageScore: z.coerce.number().int().min(1).max(10).optional(),
  intent: z.string().optional(),
  sensitivity: z
    .enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'REGULATED'])
    .optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  sortBy: z
    .enum(['triageScore', 'createdAt', 'channel'])
    .optional()
    .default('triageScore'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const createFollowUpSchema = z.object({
  messageId: z.string().min(1),
  entityId: z.string().min(1),
  reminderAt: z.coerce.date(),
  reason: z.string().optional(),
});

export const updateFollowUpSchema = z.object({
  status: z.enum(['COMPLETED', 'SNOOZED', 'CANCELLED']).optional(),
  reminderAt: z.coerce.date().optional(),
});

export const sendDraftSchema = z.object({
  messageId: z.string().min(1),
});

export const updateMessageSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const createCannedResponseSchema = z.object({
  name: z.string().min(1).max(100),
  entityId: z.string().min(1),
  channel: z.enum([
    'EMAIL',
    'SMS',
    'SLACK',
    'TEAMS',
    'DISCORD',
    'WHATSAPP',
    'TELEGRAM',
    'VOICE',
    'MANUAL',
  ]),
  category: z.string().min(1).max(50),
  subject: z.string().optional(),
  body: z.string().min(1).max(5000),
  variables: z.array(z.string()).optional(),
  tone: z.enum([
    'FIRM',
    'DIPLOMATIC',
    'WARM',
    'DIRECT',
    'CASUAL',
    'FORMAL',
    'EMPATHETIC',
    'AUTHORITATIVE',
  ]),
});

export const updateCannedResponseSchema = createCannedResponseSchema.partial();
