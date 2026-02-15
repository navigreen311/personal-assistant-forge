import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { createInvoice, listInvoices } from '@/modules/finance/services/invoice-service';

const listQuerySchema = z.object({
  entityId: z.string().min(1),
  status: z.string().optional(),
  contactId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  total: z.number().min(0).default(0),
});

const createSchema = z.object({
  entityId: z.string().min(1),
  contactId: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
  tax: z.number().min(0),
  currency: z.string().min(1).default('USD'),
  status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED']).default('DRAFT'),
  issuedDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  paidDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  paymentTerms: z.string().default('Net 30'),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listQuerySchema.safeParse(params);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const { entityId, status, contactId, page, pageSize } = parsed.data;
    const result = await listInvoices(entityId, { status, contactId }, page, pageSize);
    return paginated(result.invoices, result.total, page, pageSize);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const data = parsed.data;
    const invoice = await createInvoice({
      ...data,
      issuedDate: new Date(data.issuedDate),
      dueDate: new Date(data.dueDate),
      paidDate: data.paidDate ? new Date(data.paidDate) : undefined,
    });

    return success(invoice, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
