import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withRole } from '@/shared/middleware/auth';
import { routingService } from '@/modules/capture/services/routing-service';

// P-13 -- CROSS-ENTITY, USER-SCOPED. A routing rule is a preference of the
// person, not of one business, so this is not a `withEntityScope` route.
//
// The rules array had NO owner at all: any authenticated caller could list,
// edit or delete every tenant's rules, and a rule's `actions.entityId` chose
// which entity the routed Task/Note/Document got written into -- so adding one
// rule redirected other tenants' captures into an entity of the attacker's
// choosing. Rules are now owned; `actions.entityId` no longer decides a write
// target (see routing-service.ts).

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
  return withAuth(request, async (_req, session) => {
    try {
      const rules = routingService.getRoutingRules(session.userId);
      return success(rules);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get rules';
      return error('GET_RULES_FAILED', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = CreateRuleSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const rule = routingService.addRoutingRule(parsed.data, session.userId);
      return success(rule, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create rule';
      return error('CREATE_RULE_FAILED', message, 500);
    }
  });
}

export async function PUT(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = UpdateRuleSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { id, ...updates } = parsed.data;
      const rule = routingService.updateRoutingRule(id, session.userId, updates);
      return success(rule);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update rule';
      if (message.includes('not found')) return error('NOT_FOUND', message, 404);
      return error('UPDATE_RULE_FAILED', message, 500);
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], async (req, session) => {
    try {
      const body = await req.json();
      const parsed = DeleteRuleSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      routingService.deleteRoutingRule(parsed.data.id, session.userId);
      return success({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete rule';
      if (message.includes('not found')) return error('NOT_FOUND', message, 404);
      return error('DELETE_RULE_FAILED', message, 500);
    }
  });
}
