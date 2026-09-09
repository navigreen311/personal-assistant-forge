import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  getPersona,
  createPersona,
  addConsentEntry,
  generateWatermarkId,
} from '@/modules/voiceforge/services/persona-service';
import { withEntityScope } from '@/shared/middleware/auth';

const CloneSchema = z.object({
  sourcePersonaId: z.string().min(1),
  newName: z.string().min(1),
  entityId: z.string().min(1).optional(),
  grantedBy: z.string().min(1),
  scope: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = CloneSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      // Scope EVERY hop, not just the write (section 3). The source read is the
      // dangerous half here: an unscoped getPersona would copy another tenant's
      // voiceConfig, personality and description into a persona this caller
      // owns -- a read leak dressed up as a create.
      const source = await getPersona(parsed.data.sourcePersonaId, entityId);
      if (!source) {
        return error('NOT_FOUND', `Source persona ${parsed.data.sourcePersonaId} not found`, 404);
      }

      // Create cloned persona
      const cloned = await createPersona({
        entityId,
        name: parsed.data.newName,
        description: `Cloned from ${source.name}: ${source.description}`,
        voiceConfig: source.voiceConfig,
        personality: source.personality,
        status: 'DRAFT',
        consentChain: [],
      });

      // Add consent entry for the clone
      await addConsentEntry(cloned.id, entityId, {
        grantedBy: parsed.data.grantedBy,
        grantedAt: new Date(),
        scope: parsed.data.scope,
        status: 'GRANTED',
        watermarkId: generateWatermarkId(),
      });

      const result = await getPersona(cloned.id, entityId);
      return success(result, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
