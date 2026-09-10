import { NextRequest } from 'next/server';
import { z } from 'zod';
import { error } from '@/shared/utils/api-response';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';


/**
 * P-10 / T-026 — the most dangerous of the fabricated routes.
 *
 * This returned 201 with `message: "IP <x> has been blocked successfully"` and
 * blocked nothing. There is no block list in this build, nothing consults one,
 * and no request is ever refused on the basis of an address.
 *
 * Every other fiction in this package misinforms a reader. This one changes what
 * a responder does: someone under attack blocks the address, sees the success
 * message, and stops — believing the attack is contained while it continues.
 *
 * It now refuses, loudly, and the refusal is itself recorded in the audit log
 * along with the address that was submitted, so the attempt is not lost.
 */

const blockIpSchema = z.object({
  ip: z.string().min(1),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['owner', 'admin'],
    { resource: 'security.block-ip', sensitivityLevel: 'RESTRICTED' },
    async (req) => {
      const body = await req.json().catch(() => null);
      const parsed = blockIpSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'IP address is required', 400);
      }

      return error(
        'NOT_IMPLEMENTED',
        `Cannot block ${parsed.data.ip}: no IP block list exists in this deployment. ` +
          'This endpoint previously reported the block as successful without ' +
          'blocking anything. Block the address at your edge or firewall instead.',
        501,
        { ip: parsed.data.ip, reason: parsed.data.reason ?? null },
      );
    },
  );
}
