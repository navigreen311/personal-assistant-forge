import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    return success({
      securityScore: 82,
      checklist: [
        { id: '1', label: 'Two-factor authentication enabled', status: 'pass' },
        { id: '2', label: 'API keys stored in environment variables', status: 'pass' },
        { id: '3', label: 'Database connection encrypted (SSL)', status: 'pass' },
        { id: '4', label: 'Password last changed: 45 days ago', status: 'warning', detail: 'Recommend changing every 90 days' },
        { id: '5', label: 'Backup encryption key configured', status: 'fail' },
        { id: '6', label: 'Session timeout configured', status: 'fail' },
      ],
      recentEvents: [
        { time: new Date().toISOString(), event: 'Login success', severity: 'info', details: 'IP: 72.x.x.x' },
        { time: new Date(Date.now() - 2 * 86400000).toISOString(), event: 'Failed login', severity: 'warning', details: 'IP: 45.x.x.x' },
        { time: new Date(Date.now() - 7 * 86400000).toISOString(), event: 'Breach detected', severity: 'critical', details: 'See Crisis module' },
      ],
      failedLogins30d: 3,
      activeSessions: 1,
      lastBackup: new Date(Date.now() - 7200000).toISOString(),
    });
  });
}
