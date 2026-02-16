import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import type { Invoice, InvoiceLineItem, AgingReport } from '@/modules/finance/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calculateLineItemTotal(item: Omit<InvoiceLineItem, 'total'>): number {
  return round2(item.quantity * item.unitPrice);
}

function parseInvoiceFromRecord(record: {
  id: string;
  entityId: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: Date | null;
  category: string;
  vendor: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Invoice {
  const extended = record.description ? JSON.parse(record.description) : {};
  return {
    id: record.id,
    entityId: record.entityId,
    contactId: extended.contactId,
    invoiceNumber: extended.invoiceNumber ?? '',
    lineItems: extended.lineItems ?? [],
    subtotal: extended.subtotal ?? record.amount,
    tax: extended.tax ?? 0,
    total: record.amount,
    currency: record.currency,
    status: (extended.invoiceStatus ?? record.status) as Invoice['status'],
    issuedDate: extended.issuedDate ? new Date(extended.issuedDate) : record.createdAt,
    dueDate: record.dueDate ?? record.createdAt,
    paidDate: extended.paidDate ? new Date(extended.paidDate) : undefined,
    notes: extended.notes,
    paymentTerms: extended.paymentTerms ?? 'Net 30',
  };
}

export async function createInvoice(
  data: Omit<Invoice, 'id' | 'invoiceNumber' | 'subtotal' | 'total'>
): Promise<Invoice> {
  const lineItems: InvoiceLineItem[] = data.lineItems.map((item) => ({
    ...item,
    total: calculateLineItemTotal(item),
  }));

  const subtotal = round2(lineItems.reduce((sum, item) => sum + item.total, 0));
  const total = round2(subtotal + data.tax);
  const invoiceNumber = await generateInvoiceNumber(data.entityId);

  const extended = {
    contactId: data.contactId,
    invoiceNumber,
    lineItems,
    subtotal,
    tax: data.tax,
    invoiceStatus: data.status,
    issuedDate: data.issuedDate.toISOString(),
    paidDate: data.paidDate?.toISOString(),
    notes: data.notes,
    paymentTerms: data.paymentTerms,
  };

  const record = await prisma.financialRecord.create({
    data: {
      entityId: data.entityId,
      type: 'INVOICE',
      amount: total,
      currency: data.currency,
      status: data.status === 'PAID' ? 'PAID' : data.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING',
      dueDate: data.dueDate,
      category: 'INVOICE',
      vendor: data.contactId,
      description: JSON.stringify(extended),
    },
  });

  return {
    id: record.id,
    entityId: record.entityId,
    contactId: data.contactId,
    invoiceNumber,
    lineItems,
    subtotal,
    tax: data.tax,
    total,
    currency: data.currency,
    status: data.status,
    issuedDate: data.issuedDate,
    dueDate: data.dueDate,
    paidDate: data.paidDate,
    notes: data.notes,
    paymentTerms: data.paymentTerms,
  };
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const record = await prisma.financialRecord.findUnique({
    where: { id },
  });
  if (!record || record.type !== 'INVOICE') return null;
  return parseInvoiceFromRecord(record);
}

export async function updateInvoiceStatus(id: string, status: string): Promise<Invoice> {
  const record = await prisma.financialRecord.findUniqueOrThrow({ where: { id } });
  const extended = record.description ? JSON.parse(record.description) : {};
  extended.invoiceStatus = status;
  if (status === 'PAID') {
    extended.paidDate = new Date().toISOString();
  }

  const dbStatus = status === 'PAID' ? 'PAID' : status === 'CANCELLED' ? 'CANCELLED' : status === 'OVERDUE' ? 'OVERDUE' : 'PENDING';

  const updated = await prisma.financialRecord.update({
    where: { id },
    data: {
      status: dbStatus,
      description: JSON.stringify(extended),
    },
  });

  return parseInvoiceFromRecord(updated);
}

export async function listInvoices(
  entityId: string,
  filters: { status?: string; contactId?: string },
  page: number,
  pageSize: number
): Promise<{ invoices: Invoice[]; total: number }> {
  const where: Record<string, unknown> = {
    entityId,
    type: 'INVOICE',
  };
  if (filters.status) {
    const dbStatus = filters.status === 'PAID' ? 'PAID' : filters.status === 'CANCELLED' ? 'CANCELLED' : filters.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING';
    where.status = dbStatus;
  }
  if (filters.contactId) {
    where.vendor = filters.contactId;
  }

  const [records, total] = await Promise.all([
    prisma.financialRecord.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.financialRecord.count({ where }),
  ]);

  const invoices = records.map(parseInvoiceFromRecord);

  // Post-filter by extended status if needed (DRAFT, SENT, VIEWED are all PENDING in DB)
  if (filters.status && !['PAID', 'CANCELLED', 'OVERDUE'].includes(filters.status)) {
    const filtered = invoices.filter((inv) => inv.status === filters.status);
    return { invoices: filtered, total: filtered.length };
  }

  return { invoices, total };
}

export async function getAgingReport(entityId: string): Promise<AgingReport> {
  const now = new Date();
  const records = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'INVOICE',
      status: { in: ['PENDING', 'OVERDUE'] },
    },
  });

  const report: AgingReport = {
    current: { count: 0, amount: 0 },
    thirtyDays: { count: 0, amount: 0 },
    sixtyDays: { count: 0, amount: 0 },
    ninetyPlus: { count: 0, amount: 0 },
    totalOutstanding: 0,
  };

  for (const record of records) {
    const dueDate = record.dueDate ?? record.createdAt;
    const daysOverdue = Math.floor(
      (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysOverdue <= 30) {
      report.current.count++;
      report.current.amount = round2(report.current.amount + record.amount);
    } else if (daysOverdue <= 60) {
      report.thirtyDays.count++;
      report.thirtyDays.amount = round2(report.thirtyDays.amount + record.amount);
    } else if (daysOverdue <= 90) {
      report.sixtyDays.count++;
      report.sixtyDays.amount = round2(report.sixtyDays.amount + record.amount);
    } else {
      report.ninetyPlus.count++;
      report.ninetyPlus.amount = round2(report.ninetyPlus.amount + record.amount);
    }

    report.totalOutstanding = round2(report.totalOutstanding + record.amount);
  }

  return report;
}

export async function generateInvoiceNumber(entityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const latestRecord = await prisma.financialRecord.findFirst({
    where: {
      entityId,
      type: 'INVOICE',
      description: { contains: prefix },
    },
    orderBy: { createdAt: 'desc' },
  });

  let nextNum = 1;
  if (latestRecord?.description) {
    const extended = JSON.parse(latestRecord.description);
    const match = (extended.invoiceNumber as string)?.match(/INV-\d{4}-(\d{4})/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export async function detectOverdueInvoices(entityId: string): Promise<Invoice[]> {
  const now = new Date();
  const records = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'INVOICE',
      status: 'PENDING',
      dueDate: { lt: now },
    },
  });

  return records.map(parseInvoiceFromRecord);
}

// --- Phase 3: Additional Invoice Operations ---

export async function updateInvoice(
  invoiceId: string,
  updates: Partial<Pick<Invoice, 'dueDate' | 'notes' | 'paymentTerms' | 'status'>>
) {
  const record = await prisma.financialRecord.findUniqueOrThrow({ where: { id: invoiceId } });
  const extended = record.description ? JSON.parse(record.description) : {};

  const data: Record<string, unknown> = {};
  if (updates.dueDate !== undefined) data.dueDate = updates.dueDate;
  if (updates.notes !== undefined) extended.notes = updates.notes;
  if (updates.paymentTerms !== undefined) extended.paymentTerms = updates.paymentTerms;
  if (updates.status !== undefined) {
    extended.invoiceStatus = updates.status;
    data.status = updates.status === 'PAID' ? 'PAID' : updates.status === 'CANCELLED' ? 'CANCELLED' : updates.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING';
  }
  data.description = JSON.stringify(extended);

  const updated = await prisma.financialRecord.update({
    where: { id: invoiceId },
    data,
  });

  return parseInvoiceFromRecord(updated);
}

export async function markAsPaid(invoiceId: string, paidDate?: Date) {
  const record = await prisma.financialRecord.findUniqueOrThrow({ where: { id: invoiceId } });
  const extended = record.description ? JSON.parse(record.description) : {};
  extended.invoiceStatus = 'PAID';
  extended.paidDate = (paidDate ?? new Date()).toISOString();

  const updated = await prisma.financialRecord.update({
    where: { id: invoiceId },
    data: {
      status: 'PAID',
      description: JSON.stringify(extended),
    },
  });

  return parseInvoiceFromRecord(updated);
}

export async function markAsOverdue(entityId: string) {
  const now = new Date();
  const pendingOverdue = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'INVOICE',
      status: 'PENDING',
      dueDate: { lt: now },
    },
  });

  let updatedCount = 0;
  for (const record of pendingOverdue) {
    const extended = record.description ? JSON.parse(record.description) : {};
    extended.invoiceStatus = 'OVERDUE';
    await prisma.financialRecord.update({
      where: { id: record.id },
      data: {
        status: 'OVERDUE',
        description: JSON.stringify(extended),
      },
    });
    updatedCount++;
  }

  return { count: updatedCount };
}

export async function getAccountsReceivable(entityId: string) {
  const records = await prisma.financialRecord.findMany({
    where: {
      entityId,
      type: 'INVOICE',
      status: { in: ['PENDING', 'OVERDUE'] },
    },
  });

  return {
    total: round2(records.reduce((s, r) => s + r.amount, 0)),
    pendingCount: records.filter((r) => r.status === 'PENDING').length,
    overdueCount: records.filter((r) => r.status === 'OVERDUE').length,
    pendingTotal: round2(records.filter((r) => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0)),
    overdueTotal: round2(records.filter((r) => r.status === 'OVERDUE').reduce((s, r) => s + r.amount, 0)),
  };
}

export async function getInvoiceSummary(
  entityId: string,
  dateRange?: { start: Date; end: Date }
) {
  const where: Record<string, unknown> = {
    entityId,
    type: 'INVOICE',
  };
  if (dateRange) {
    where.createdAt = { gte: dateRange.start, lte: dateRange.end };
  }

  const records = await prisma.financialRecord.findMany({ where });

  const totalInvoiced = round2(records.reduce((s, r) => s + r.amount, 0));
  const paidRecords = records.filter((r) => r.status === 'PAID');
  const totalPaid = round2(paidRecords.reduce((s, r) => s + r.amount, 0));
  const overdueRecords = records.filter((r) => r.status === 'OVERDUE');
  const totalOverdue = round2(overdueRecords.reduce((s, r) => s + r.amount, 0));

  // Calculate average days to payment
  let totalDaysToPayment = 0;
  let paidWithDates = 0;
  for (const r of paidRecords) {
    const extended = r.description ? JSON.parse(r.description) : {};
    if (extended.paidDate && extended.issuedDate) {
      const issued = new Date(extended.issuedDate);
      const paid = new Date(extended.paidDate);
      totalDaysToPayment += Math.floor((paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24));
      paidWithDates++;
    }
  }

  const avgDaysToPayment = paidWithDates > 0 ? round2(totalDaysToPayment / paidWithDates) : 0;

  return {
    totalInvoiced,
    totalPaid,
    totalOverdue,
    totalPending: round2(totalInvoiced - totalPaid - totalOverdue),
    invoiceCount: records.length,
    avgDaysToPayment,
  };
}

// --- AI-Enhanced Invoice Features ---

export async function generateInvoiceDescription(
  lineItems: Array<{ description: string; quantity: number; unitPrice: number }>,
  clientContext?: { name?: string; industry?: string }
): Promise<string> {
  try {
    const itemsSummary = lineItems
      .map((item) => `${item.quantity}x ${item.description} @ $${item.unitPrice}`)
      .join(', ');

    const description = await generateText(
      `Generate a professional invoice description/memo based on these line items:
${itemsSummary}
${clientContext?.name ? `Client: ${clientContext.name}` : ''}
${clientContext?.industry ? `Industry: ${clientContext.industry}` : ''}

Write a concise, professional 1-2 sentence description suitable for an invoice memo field.`,
      {
        maxTokens: 256,
        temperature: 0.5,
        system: 'You are a professional invoicing assistant. Write clear, concise invoice descriptions.',
      }
    );

    return description;
  } catch {
    // Fallback: template-based description
    const total = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return `Invoice for ${lineItems.length} item(s) totaling $${total.toFixed(2)}.`;
  }
}

export async function generatePaymentReminder(
  invoice: Invoice,
  clientName?: string
): Promise<string> {
  try {
    const daysOverdue = invoice.dueDate
      ? Math.max(0, Math.floor((Date.now() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    const reminder = await generateText(
      `Draft a professional payment reminder email for an overdue invoice.

Invoice: ${invoice.invoiceNumber}
Amount: $${invoice.total} ${invoice.currency}
Due date: ${invoice.dueDate.toISOString().split('T')[0]}
Days overdue: ${daysOverdue}
${clientName ? `Client: ${clientName}` : ''}
Payment terms: ${invoice.paymentTerms}

Write a polite but firm reminder that maintains the business relationship. Keep it under 150 words.`,
      {
        maxTokens: 512,
        temperature: 0.5,
        system: 'You are a professional accounts receivable assistant. Write courteous but clear payment reminders.',
      }
    );

    return reminder;
  } catch {
    return `Friendly reminder: Invoice ${invoice.invoiceNumber} for $${invoice.total} was due on ${invoice.dueDate.toISOString().split('T')[0]}. Please arrange payment at your earliest convenience.`;
  }
}
