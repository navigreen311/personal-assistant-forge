import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const entries = [
      { id: 'al-001', time: new Date().toISOString(), user: 'alex@johnson.com', action: 'Login', ipAddress: '72.134.22.91', location: 'San Francisco, US', status: 'success' },
      { id: 'al-002', time: new Date(Date.now() - 300000).toISOString(), user: 'maria@johnson.com', action: 'Login', ipAddress: '98.45.12.78', location: 'Austin, US', status: 'success' },
      { id: 'al-003', time: new Date(Date.now() - 1800000).toISOString(), user: 'unknown@attacker.com', action: 'Login attempt', ipAddress: '45.227.11.3', location: 'Sao Paulo, BR', status: 'blocked' },
      { id: 'al-004', time: new Date(Date.now() - 3600000).toISOString(), user: 'david@johnson.com', action: 'Export data', ipAddress: '72.134.22.95', location: 'San Francisco, US', status: 'success' },
      { id: 'al-005', time: new Date(Date.now() - 7200000).toISOString(), user: 'unknown@attacker.com', action: 'Login attempt', ipAddress: '45.227.11.3', location: 'Sao Paulo, BR', status: 'failed' },
      { id: 'al-006', time: new Date(Date.now() - 10800000).toISOString(), user: 'sarah@johnson.com', action: 'Password change', ipAddress: '10.0.0.42', location: 'New York, US', status: 'success' },
      { id: 'al-007', time: new Date(Date.now() - 14400000).toISOString(), user: 'alex@johnson.com', action: 'API key rotation', ipAddress: '72.134.22.91', location: 'San Francisco, US', status: 'success' },
      { id: 'al-008', time: new Date(Date.now() - 86400000).toISOString(), user: 'unknown', action: 'Login attempt', ipAddress: '203.0.113.42', location: 'Beijing, CN', status: 'blocked' },
      { id: 'al-009', time: new Date(Date.now() - 90000000).toISOString(), user: 'emily@davis.com', action: 'Login', ipAddress: '192.168.1.105', location: 'Chicago, US', status: 'success' },
      { id: 'al-010', time: new Date(Date.now() - 172800000).toISOString(), user: 'unknown', action: 'Login attempt', ipAddress: '185.220.101.1', location: 'Moscow, RU', status: 'blocked' },
    ];

    const autoBlockRules = [
      { id: 'rule-1', label: 'Block IP after 5 failed login attempts', enabled: true },
      { id: 'rule-2', label: 'Alert on login from new country', enabled: true },
      { id: 'rule-3', label: 'Alert on login outside business hours', enabled: false },
    ];

    return success({ entries, autoBlockRules });
  });
}
