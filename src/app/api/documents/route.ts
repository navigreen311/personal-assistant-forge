import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

const documentTypeEnum = z.enum([
  'BRIEF', 'MEMO', 'SOP', 'MINUTES', 'INVOICE', 'SOW', 'PROPOSAL', 'CONTRACT', 'REPORT', 'DECK',
]);

const documentStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);

const listDocumentsSchema = z.object({
  entityId: z.string().optional(),
  type: documentTypeEnum.optional(),
  status: documentStatusEnum.optional(),
  search: z.string().optional(),
  sort: z.enum(['updatedAt', 'createdAt', 'title', 'type']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createDocumentSchema = z.object({
  title: z.string().min(1, 'title is required'),
  entityId: z.string().min(1, 'entityId is required'),
  type: documentTypeEnum,
  content: z.string().optional(),
  templateId: z.string().optional(),
  status: documentStatusEnum.default('DRAFT'),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const searchParams = Object.fromEntries(req.nextUrl.searchParams);

      const parsed = listDocumentsSchema.safeParse(searchParams);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          issues: parsed.error.issues,
        });
      }

      const { entityId, type, status, search, sort, sortOrder, page, pageSize } = parsed.data;

      // Get all entity IDs belonging to the authenticated user
      const userEntities = await prisma.entity.findMany({
        where: { userId: session.userId },
        select: { id: true },
      });
      const userEntityIds = userEntities.map((e) => e.id);

      if (userEntityIds.length === 0) {
        return paginated([], 0, page, pageSize);
      }

      // Build where clause ensuring entities belong to user
      const where: Record<string, unknown> = {
        entityId: entityId
          ? { in: userEntityIds.includes(entityId) ? [entityId] : [] }
          : { in: userEntityIds },
        deletedAt: null,
      };

      if (search) {
        where.title = { contains: search, mode: 'insensitive' };
      }

      if (type) where.type = type;
      if (status) where.status = status;

      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where,
          include: {
            entity: { select: { id: true, name: true } },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { [sort]: sortOrder },
        }),
        prisma.document.count({ where }),
      ]);

      return paginated(documents, total, page, pageSize);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to list documents', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();

      const parsed = createDocumentSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid document data', 400, {
          issues: parsed.error.issues,
        });
      }

      const data = parsed.data;

      // Verify entity belongs to user
      const entity = await prisma.entity.findUnique({
        where: { id: data.entityId },
      });

      if (!entity) {
        return error('NOT_FOUND', `Entity not found: ${data.entityId}`, 404);
      }

      if (entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      const document = await prisma.document.create({
        data: {
          title: data.title,
          entityId: data.entityId,
          type: data.type,
          content: data.content,
          templateId: data.templateId,
          status: data.status,
        },
        include: {
          entity: { select: { id: true, name: true } },
        },
      });

      return success(document, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to create document', 500);
    }
  });
}
