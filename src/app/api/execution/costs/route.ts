// ============================================================================
// POST /api/execution/costs  - Estimate cost for an action
// GET /api/execution/costs   - Get daily cost summary for an entity
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
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
  entityId: z.string().min(1, 'entityId is required'),
  date: z.string().optional(),
});

// --- Handlers ---

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
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
  return withAuth(request, async (req, _session) => {
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

      const { entityId, date } = parsed.data;
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
