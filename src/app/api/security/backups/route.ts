import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const schedule = {
      frequency: 'daily',
      retention: '30 days',
      destination: 'AWS S3',
      encryptionEnabled: true,
    };

    const recentBackups = [
      { id: 'bk-001', date: new Date(Date.now() - 7200000).toISOString(), size: '2.4 GB', duration: '12 min', status: 'completed' },
      { id: 'bk-002', date: new Date(Date.now() - 86400000).toISOString(), size: '2.3 GB', duration: '11 min', status: 'completed' },
      { id: 'bk-003', date: new Date(Date.now() - 172800000).toISOString(), size: '2.3 GB', duration: '13 min', status: 'completed' },
      { id: 'bk-004', date: new Date(Date.now() - 259200000).toISOString(), size: '2.2 GB', duration: '10 min', status: 'completed' },
      { id: 'bk-005', date: new Date(Date.now() - 345600000).toISOString(), size: '2.2 GB', duration: '14 min', status: 'failed' },
    ];

    const disasterRecovery = {
      rpo: '24 hours',
      rto: '~15 minutes',
      lastRecoveryTest: new Date(Date.now() - 30 * 86400000).toISOString(),
      lastRecoveryTestResult: 'passed',
    };

    return success({ schedule, recentBackups, disasterRecovery });
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    return success({
      id: `bk-${Date.now()}`,
      date: new Date().toISOString(),
      status: 'in_progress',
      message: 'Backup initiated successfully',
    }, 201);
  });
}
