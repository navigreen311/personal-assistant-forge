import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';

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
  // Optional: omitted means the session's active entity. Do not make the
  // client name its own tenant -- that habit is the bug this closes.
  entityId: z.string().min(1).optional(),
  type: documentTypeEnum,
  content: z.string().optional(),
  templateId: z.string().optional(),
  status: documentStatusEnum.default('DRAFT'),
});

/**
 * GET is a GENUINE CROSS-ENTITY LIST (tenancy-pattern.md sec.5b).
 *
 * With no `entityId` it has always meant "every document I own, across all my
 * entities", and the documents index page depends on that. Switching it to
 * withEntityScope would silently narrow it to the session's active entity --
 * a behaviour change invisible to every cross-tenant assertion. So it keeps
 * withAuth and proves the scope as a SET: the entities owned by this user.
 *
 * The one behaviour change: a caller naming an entity they do not own now gets
 * an explicit 403 instead of a silently empty page.
 */
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

      const userEntities = await prisma.entity.findMany({
        where: { userId: session.userId },
        select: { id: true },
      });
      const userEntityIds = userEntities.map((e) => e.id);

      if (entityId && !userEntityIds.includes(entityId)) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      if (userEntityIds.length === 0) {
        return paginated([], 0, page, pageSize);
      }

      const where: Record<string, unknown> = {};

      if (search) {
        where.title = { contains: search, mode: 'insensitive' };
      }

      if (type) where.type = type;
      if (status) where.status = status;

      // Scope applied LAST and unconditionally, so no filter combination above
      // can widen it.
      where.deletedAt = null;
      where.entityId = entityId ? entityId : { in: userEntityIds };

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
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();

      const parsed = createDocumentSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid document data', 400, {
          issues: parsed.error.issues,
        });
      }

      const data = parsed.data;

      const document = await prisma.document.create({
        data: {
          title: data.title,
          // entityId comes from the verified scope, never from `data`.
          entityId,
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
