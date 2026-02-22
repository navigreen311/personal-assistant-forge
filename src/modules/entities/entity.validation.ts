import { z } from 'zod';

export const extraFieldsSchema = z.object({
  industry: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  primaryEmail: z.string().email().optional().or(z.literal('')),
  primaryPhone: z.string().max(30).optional(),
  address: z.string().max(500).optional(),
  defaultTone: z.enum(['Professional', 'Casual', 'Formal', 'Warm']).optional(),
  aiBudgetLimit: z.number().min(0).optional(),
  preferredModel: z.enum(['Auto', 'Haiku', 'Sonnet', 'Opus']).optional(),
}).optional();

export const brandKitSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  logoUrl: z.string().url().optional(),
  fontFamily: z.string().optional(),
  toneGuide: z.string().optional(),
  extraFields: extraFieldsSchema,
});

export const complianceProfileEnum = z.enum([
  'HIPAA',
  'GDPR',
  'CCPA',
  'SOX',
  'SEC',
  'REAL_ESTATE',
  'GENERAL',
]);

export const createEntitySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
  type: z.string().min(1, 'Type is required').max(50),
  complianceProfile: z.array(complianceProfileEnum).optional(),
  brandKit: brandKitSchema.optional(),
  voicePersonaId: z.string().optional(),
  phoneNumbers: z.array(z.string()).optional(),
});

export const updateEntitySchema = createEntitySchema.partial();

export const listEntitiesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100, 'Page size must be 100 or fewer').optional(),
  search: z.string().optional(),
  type: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'type']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type CreateEntitySchemaType = z.infer<typeof createEntitySchema>;
export type UpdateEntitySchemaType = z.infer<typeof updateEntitySchema>;
export type ListEntitiesSchemaType = z.infer<typeof listEntitiesSchema>;
