import { prisma } from '@/lib/db';
import type { JobDataMap, JobResult } from '../jobs';
import { JobType } from '../jobs';

export async function processInvoiceJob(
  data: JobDataMap[typeof JobType.INVOICE_PROCESS]
): Promise<JobResult> {
  const start = Date.now();

  try {
    const invoice = await prisma.financialRecord.findUnique({
      where: { id: data.invoiceId },
    });

    if (!invoice) {
      return {
        success: false,
        message: `Invoice ${data.invoiceId} not found`,
        processingTimeMs: Date.now() - start,
      };
    }

    let resultData: Record<string, unknown> = {};

    switch (data.action) {
      case 'CREATE': {
        const doc = await prisma.document.create({
          data: {
            title: `Invoice #${invoice.id}`,
            content: JSON.stringify(invoice),
            type: 'INVOICE',
            entityId: data.entityId,
          },
        });
        resultData = { documentId: doc.id };
        break;
      }
      case 'SEND': {
        // Enqueue an EMAIL_SEND job via the registry (imported at runtime to avoid circular deps)
        const { enqueueJob } = await import('../jobs/registry');
        const jobId = await enqueueJob(JobType.EMAIL_SEND, {
          to: (invoice as Record<string, unknown>).recipientEmail as string ?? '',
          subject: `Invoice #${invoice.id}`,
          body: `Please find attached invoice #${invoice.id}.`,
          entityId: data.entityId,
        });
        resultData = { emailJobId: jobId };
        break;
      }
      case 'RECONCILE': {
        await prisma.financialRecord.update({
          where: { id: data.invoiceId },
          data: { status: 'RECONCILED' },
        });
        resultData = { status: 'RECONCILED' };
        break;
      }
    }

    await prisma.actionLog.create({
      data: {
        actor: 'SYSTEM',
        actionType: 'INVOICE_PROCESS',
        target: `entity:${data.entityId}/invoice:${data.invoiceId}`,
        reason: `Invoice ${data.action}: ${data.invoiceId}`,
        blastRadius: 'LOW',
        reversible: data.action !== 'SEND',
        status: 'EXECUTED',
      },
    });

    return {
      success: true,
      message: `Invoice ${data.action} completed for ${data.invoiceId}`,
      data: resultData,
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[InvoiceProcessor] Failed:', message);
    throw err;
  }
}
