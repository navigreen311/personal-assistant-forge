import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { processUpload } from '@/lib/integrations/storage/uploads';
import { createDocument } from '@/lib/integrations/storage/documents';
import type { AuthSession } from '@/lib/auth/types';

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, async (authedReq: NextRequest, session: AuthSession) => {
    try {
      const formData = await authedReq.formData();

      const file = formData.get('file');
      if (!file || !(file instanceof Blob)) {
        return error('MISSING_FILE', 'A file is required', 400);
      }

      const entityId = formData.get('entityId');
      if (!entityId || typeof entityId !== 'string') {
        return error('MISSING_ENTITY_ID', 'entityId is required', 400);
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
  });
}
