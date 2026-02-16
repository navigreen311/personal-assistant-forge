import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { routingService } from '@/modules/capture/services/routing-service';

const ConditionSchema = z.object({
  field: z.enum(['source', 'contentType', 'content', 'sender', 'keyword']),
  operator: z.enum(['equals', 'contains', 'matches', 'startsWith']),
  value: z.string().min(1),
});

const ActionSchema = z.object({
  targetType: z.enum(['TASK', 'CONTACT', 'NOTE', 'EVENT', 'MESSAGE', 'EXPENSE']),
  entityId: z.string().optional(),
  projectId: z.string().optional(),
  priority: z.enum(['P0', 'P1', 'P2']).optional(),
  tags: z.array(z.string()).optional(),
});

const CreateRuleSchema = z.object({
  name: z.string().min(1),
  conditions: z.array(ConditionSchema).min(1),
  actions: ActionSchema,
  priority: z.number().int().min(0).max(999),
  isActive: z.boolean().default(true),
});

const UpdateRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  conditions: z.array(ConditionSchema).min(1).optional(),
  actions: ActionSchema.optional(),
  priority: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

const DeleteRuleSchema = z.object({
  id: z.string().min(1),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const rules = routingService.getRoutingRules();
      return success(rules);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get rules';
      return error('GET_RULES_FAILED', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = CreateRuleSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const rule = routingService.addRoutingRule(parsed.data);
      return success(rule, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create rule';
      return error('CREATE_RULE_FAILED', message, 500);
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = UpdateRuleSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { id, ...updates } = parsed.data;
      const rule = routingService.updateRoutingRule(id, updates);
      return success(rule);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update rule';
      return error('UPDATE_RULE_FAILED', message, 500);
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = DeleteRuleSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      routingService.deleteRoutingRule(parsed.data.id);
      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete rule';
      return error('DELETE_RULE_FAILED', message, 500);
    }
  });
}
