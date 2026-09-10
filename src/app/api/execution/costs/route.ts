// ============================================================================
// POST /api/execution/costs  - Estimate cost for an action
// GET /api/execution/costs   - Get daily cost summary for an entity
// ============================================================================
//
// P-09 (T-001): GET required `entityId` and never verified it. The service it
// called then ignored the entity entirely (a filter ending in `|| true`), so
// every caller got the whole platform's spend for the day. Both halves fixed.
//
// POST stays off `withEntityScope`: an estimate is a pure function of an
// action type and its parameters -- it reads no tenant data and touches no
// database, so there is no scope for it to be missing. P-15 nonetheless
// role-gates it, because an estimate is what precedes spending money.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import {
  estimateActionCost,
  getDailyCostSummary,
} from '@/modules/execution/services/cost-estimator';

// --- Validation Schemas ---

const estimateCostSchema = z.object({
  actionType: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()),
});

const dailySummarySchema = z.object({
  entityId: z.string().optional(),
  date: z.string().optional(),
});

// --- Handlers ---

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, _session) => {
    try {
      const body: unknown = await req.json();

      const parsed = estimateCostSchema.safeParse(body);
      if (!parsed.success) {
        return error(
          'VALIDATION_ERROR',
          'Invalid request body',
          400,
          { issues: parsed.error.flatten().fieldErrors }
        );
      }

      const estimate = estimateActionCost(
        parsed.data.actionType,
        parsed.data.parameters
      );
      return success(estimate);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);

      const parsed = dailySummarySchema.safeParse({
        entityId: searchParams.get('entityId') ?? undefined,
        date: searchParams.get('date') ?? undefined,
      });

      if (!parsed.success) {
        return error(
          'VALIDATION_ERROR',
          'Invalid query parameters',
          400,
          { issues: parsed.error.flatten().fieldErrors }
        );
      }

      const { date } = parsed.data;
      const targetDate = date ? new Date(date) : new Date();

      if (isNaN(targetDate.getTime())) {
        return error(
          'VALIDATION_ERROR',
          'Invalid date format. Use ISO 8601 (e.g. 2026-02-15)',
          400
        );
      }

      const summary = await getDailyCostSummary(entityId, targetDate);
      return success(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
