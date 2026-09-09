// ============================================================================
// GET /api/delegation/stats - Returns delegation statistics
//
// P-10/T-026. This route ran four queries against `(prisma as any).delegationTask`
// — a delegate that DOES NOT EXIST in the schema — each wrapped in a `safeCount`
// that returned 0 on failure. So every query threw, every count was 0, and the
// route answered `{ activeDelegated: 0, completedThisWeek: 0, timeSavedHours: 0,
// pendingApproval: 0 }` on every request, for every user, forever. A dashboard
// showing four zeros reads as "you have delegated nothing", not as "this feature
// is not connected", and nothing in the response said which it was.
//
// The delegations themselves live in `delegationStore`, an in-memory Map in
// `delegation-service.ts` (no table exists — flagged to the coordinator). The
// counts are therefore computed from the store that actually holds them, scoped
// to the caller. Zero now means zero.
// ============================================================================

import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import { getDelegatedTasks } from '@/modules/delegation/services/delegation-service';

function startOfThisWeek(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
}

export async function GET(request: NextRequest) {
  return withAuditedAuth(
    request,
    { resource: 'delegation.stats' },
    async (req, session) => {
      try {
        // Scoped to the caller by the verified session. The route previously
        // took an optional `?entityId=` and verified it, but delegations have no
        // entityId in the model, so the parameter narrowed nothing — it only
        // looked as though it did.
        const delegations = await getDelegatedTasks(session.userId, 'delegated_by');

        const weekStart = startOfThisWeek(new Date());

        const activeDelegated = delegations.filter(
          (d) => d.status === 'PENDING' || d.status === 'IN_REVIEW' || d.status === 'APPROVED',
        ).length;

        const completedThisWeek = delegations.filter(
          (d) => d.status === 'COMPLETED' && d.completedAt !== undefined && d.completedAt >= weekStart,
        ).length;

        const pendingApproval = delegations.filter((d) =>
          d.approvalChain.some((step) => step.status === 'PENDING'),
        ).length;

        // Hours between delegation and completion, for work finished this week.
        const timeSavedHours = delegations
          .filter((d) => d.status === 'COMPLETED' && d.completedAt && d.completedAt >= weekStart)
          .reduce((total, d) => {
            const ms = d.completedAt!.getTime() - d.delegatedAt.getTime();
            return total + Math.max(0, ms) / (1000 * 60 * 60);
          }, 0);

        return success({
          activeDelegated,
          completedThisWeek,
          timeSavedHours: Math.round(timeSavedHours * 10) / 10,
          pendingApproval,
        });
      } catch (err) {
        return error(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to fetch delegation stats',
          500,
        );
      }
    },
  );
}
