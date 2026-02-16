import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getSSOConfig, configureSAML, enableSSO, disableSSO } from '@/modules/admin/services/sso-service';

const configureSSOSchema = z.object({
  entityId: z.string().min(1),
  provider: z.enum(['SAML', 'OIDC']),
  issuerUrl: z.string().url().optional(),
  clientId: z.string().optional(),
  certificateFingerprint: z.string().optional(),
  action: z.enum(['configure', 'enable', 'disable']).default('configure'),
});

export async function GET(request: NextRequest) {
  try {
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) return error('VALIDATION_ERROR', 'entityId is required', 400);

    const config = await getSSOConfig(entityId);
    return success(config);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = configureSSOSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const { entityId, action, ...config } = parsed.data;

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
}
