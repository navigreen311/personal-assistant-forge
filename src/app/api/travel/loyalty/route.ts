import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import type { LoyaltyProgram } from '@/modules/travel/types';

/**
 * Loyalty programs, stored on `Document` with `type = 'LOYALTY_PROGRAM'`.
 *
 * This route used to return three hardcoded accounts -- "Delta SkyMiles, Gold,
 * 45,230 miles, ****7890", "Marriott Bonvoy Platinum", "Amex 125,000 points" --
 * to every authenticated caller, and its POST echoed the body back with an id
 * built from `Date.now()` and wrote nothing. Those balances were presented as
 * the user's own, and `estimatedValue` gave them a dollar figure.
 *
 * There is no `LoyaltyAccount` model and the schema is frozen, so this follows
 * the same `Document` shadow convention used elsewhere in these modules.
 *
 * NOTHING IS FETCHED FROM AN AIRLINE OR HOTEL PROGRAM. No loyalty provider is
 * integrated: balances are whatever the user recorded, and `estimatedValue` is
 * the caller's own figure rather than a valuation this system performed.
 */

const DOCUMENT_TYPE = 'LOYALTY_PROGRAM';

const createSchema = z.object({
  programName: z.string().min(1),
  accountNumber: z.string().min(1),
  tier: z.string().default(''),
  balance: z.number().min(0).default(0),
  unit: z.enum(['miles', 'points']).default('points'),
  expiringAmount: z.number().min(0).optional(),
  expiringDate: z.string().transform((s) => new Date(s)).optional(),
  estimatedValue: z.number().min(0).default(0),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

type LoyaltyContent = Omit<LoyaltyProgram, 'id' | 'userId' | 'expiringDate'> & {
  expiringDate?: string;
};

function docToLoyalty(
  doc: { id: string; content: string | null },
  userId: string
): LoyaltyProgram {
  const data = (doc.content ? JSON.parse(doc.content) : {}) as Partial<LoyaltyContent>;
  return {
    id: doc.id,
    userId,
    programName: data.programName ?? '',
    accountNumber: data.accountNumber ?? '',
    tier: data.tier ?? '',
    balance: data.balance ?? 0,
    unit: data.unit ?? 'points',
    expiringAmount: data.expiringAmount,
    expiringDate: data.expiringDate ? new Date(data.expiringDate) : undefined,
    estimatedValue: data.estimatedValue ?? 0,
  };
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, session, entityId) => {
    try {
      const docs = await prisma.document.findMany({
        where: { entityId, type: DOCUMENT_TYPE, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      return success(docs.map((doc) => docToLoyalty(doc, session.userId)));
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
      try {
        const body = await req.json();
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        const { entityId: _requested, expiringDate, ...rest } = parsed.data;
        const content: LoyaltyContent = {
          ...rest,
          expiringDate: expiringDate?.toISOString(),
        };

        const created = await prisma.document.create({
          data: {
            title: content.programName,
            entityId,
            type: DOCUMENT_TYPE,
            status: 'ACTIVE',
            content: JSON.stringify(content),
          },
        });

        return success(docToLoyalty(created, session.userId), 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
