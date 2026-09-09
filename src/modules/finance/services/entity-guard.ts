/**
 * Defence in depth for finance writes.
 *
 * A `VerifiedEntityId` already carries the authorization -- `withEntityScope`
 * proved the caller owns the entity before minting it. This re-asserts the same
 * fact at the write, for the reason P-04 gives in `task-crud.ts`: if the brand
 * and the caller ever disagree, the brand was manufactured rather than earned,
 * and money is the wrong place to find that out quietly.
 *
 * `FinancialRecord`, `Document` and `Budget` have no `userId` column and the
 * schema is frozen, so the authenticated caller cannot be written onto the row.
 * The check is therefore what `userId` is for in these signatures.
 *
 * See docs/parallel-build/tenancy-pattern.md §2.
 */

import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';

export async function assertEntityOwner(
  entityId: VerifiedEntityId,
  userId: string
): Promise<void> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, userId: true },
  });

  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }

  if (entity.userId !== userId) {
    // Unreachable through withEntityScope.
    throw new Error('Entity does not belong to the authenticated user');
  }
}
