import { NextRequest } from 'next/server';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import type { AuthSession } from '@/lib/auth/types';

// --- Types ---

interface ExportResponse {
  exportId: string;
  format: 'json' | 'csv';
  status: 'queued';
  message: string;
  estimatedCompletionMinutes: number;
}

// --- Handlers ---

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const format = body.format === 'csv' ? 'csv' : 'json';

    // Generate a mock export ID
    const exportId = `exp_${Date.now()}_${session.userId.slice(0, 8)}`;

    const data: ExportResponse = {
      exportId,
      format,
      status: 'queued',
      message: `Data export (${format.toUpperCase()}) has been queued. You will receive a download link via email at ${session.email}.`,
      estimatedCompletionMinutes: 5,
    };

    return success(data, 202);
  } catch (err) {
    console.error('[settings/export] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to initiate data export', 500);
  }
}

// --- Route Exports ---

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePost);
}
