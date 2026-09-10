import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';
import { getSSOConfig, configureSAML, enableSSO, disableSSO } from '@/modules/admin/services/sso-service';

// P-10/T-001. The worst of the six: SSO configuration decides which identity
// provider is trusted to assert who a tenant's users are. A global-admin session
// plus `?entityId=<theirs>` was enough to point another tenant's sign-in at an
// issuer of the caller's choosing. That is account takeover, not a data leak.
const configureSSOSchema = z.object({
  entityId: z.string().min(1).optional(),
  provider: z.enum(['SAML', 'OIDC']),
  issuerUrl: z.string().url().optional(),
  clientId: z.string().optional(),
  certificateFingerprint: z.string().optional(),
  action: z.enum(['configure', 'enable', 'disable']).default('configure'),
});

const AUDIT = { resource: 'admin.sso', sensitivityLevel: 'RESTRICTED' as const };

export async function GET(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['owner', 'admin'], AUDIT, async (req, session, entityId) => {
    try {
      const config = await getSSOConfig(entityId);
      return success(config);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(request, ['owner', 'admin'], AUDIT, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = configureSSOSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { entityId: _requested, action, ...config } = parsed.data;

      let result;
      switch (action) {
        case 'enable':
          result = await enableSSO(entityId);
          break;
        case 'disable':
          result = await disableSSO(entityId);
          break;
        default:
          result = await configureSAML(entityId, config);
          break;
      }

      return success(result, action === 'configure' ? 201 : 200);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
