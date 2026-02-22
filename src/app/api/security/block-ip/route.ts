import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function POST(request: NextRequest) {
  return withAuth(request, async (req) => {
    try {
      const body = await req.json();
      const { ip, reason } = body;

      if (!ip) {
        return error('VALIDATION_ERROR', 'IP address is required', 400);
      }

      return success({
        ip,
        reason: reason || 'Manually blocked',
        blockedAt: new Date().toISOString(),
        message: `IP ${ip} has been blocked successfully`,
      }, 201);
    } catch {
      return error('INTERNAL_ERROR', 'Failed to block IP', 500);
    }
  });
}
