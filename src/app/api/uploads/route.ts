import { NextRequest } from 'next/server';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { processUpload } from '@/lib/integrations/storage/uploads';
import { createDocument } from '@/lib/integrations/storage/documents';

// POST /api/uploads  (multipart/form-data)
//
// P-23 tenancy: this route read `entityId` out of the form and handed it to
// processUpload + createDocument unchecked, so an authenticated user could
// write a Document row -- and a stored file -- into any tenant's entity. It was
// the only WRITE on the bad pattern in the platform surface.
//
// The body is multipart, which is why this cannot simply become
// `withEntityScope`: that helper's fallback probe does `req.clone().json()`,
// which throws on multipart and silently falls through to the session's active
// entity. The form's entityId would then be ignored rather than verified, and
// an upload aimed at entity B would quietly land in entity A.
//
// So: authenticate first (an anonymous caller never gets its body parsed), read
// the form once, then hand the id to `withEntityScope` as the explicit
// argument -- the same shape tenancy-pattern.md §4 uses for `[id]` routes.
export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, async (authedReq) => {
    let formData: FormData;
    try {
      formData = await authedReq.formData();
    } catch {
      return error('INVALID_BODY', 'Expected multipart/form-data', 400);
    }

    const rawEntityId = formData.get('entityId');
    if (!rawEntityId || typeof rawEntityId !== 'string') {
      return error('MISSING_ENTITY_ID', 'entityId is required', 400);
    }

    return withEntityScope(
      authedReq,
      async (_scopedReq, session, entityId) => {
        try {
          const file = formData.get('file');
          if (!file || !(file instanceof Blob)) {
            return error('MISSING_FILE', 'A file is required', 400);
          }

          const category = (formData.get('category') as string) || 'documents';
          const title = (formData.get('title') as string) || (file instanceof File ? file.name : 'Untitled');
          const description = formData.get('description') as string | undefined;
          const tagsRaw = formData.get('tags') as string | undefined;
          const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

          const fileName = file instanceof File ? file.name : 'upload';
          const mimeType = file.type || 'application/octet-stream';

          // Process upload (validate, scan, checksum, store)
          const uploadResult = await processUpload({
            file,
            fileName,
            mimeType,
            entityId,
            userId: session.userId,
            category: category as 'documents' | 'images' | 'attachments' | 'exports',
          });

          // Create document record
          const doc = await createDocument({
            entityId,
            title,
            description: description || undefined,
            category,
            tags,
            file: {
              key: uploadResult.key,
              sizeBytes: uploadResult.sizeBytes,
              checksum: uploadResult.checksum,
              mimeType: uploadResult.mimeType,
            },
            userId: session.userId,
          });

          return success({ ...uploadResult, documentId: doc.id }, 201);
        } catch (err) {
          const message = (err as Error).message;

          if (message.startsWith('UPLOAD_VALIDATION_FAILED:')) {
            return error('VALIDATION_ERROR', message, 400);
          }
          if (message.startsWith('VIRUS_DETECTED:')) {
            return error('VIRUS_DETECTED', message, 422);
          }

          return error('UPLOAD_ERROR', 'File upload failed', 500, { detail: message });
        }
      },
      rawEntityId
    );
  });
}
