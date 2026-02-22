import { NextRequest } from 'next/server';
import { success } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    const threats = [
      { id: 'threat-001', type: 'INJECTION', severity: 'HIGH', description: 'Prompt injection attempt detected in message input', timestamp: new Date(Date.now() - 12 * 60000).toISOString(), blocked: true, source: '45.227.11.3' },
      { id: 'threat-002', type: 'FRAUD', severity: 'CRITICAL', description: 'Suspicious bulk financial operation detected', timestamp: new Date(Date.now() - 47 * 60000).toISOString(), blocked: true, source: '203.0.113.42' },
      { id: 'threat-003', type: 'IMPERSONATION', severity: 'MEDIUM', description: 'Email header mismatch detected - possible spoofing', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), blocked: false, source: 'attacker@malicious.net' },
      { id: 'threat-004', type: 'RATE_LIMIT', severity: 'LOW', description: 'Rate limit exceeded for API endpoint /api/contacts', timestamp: new Date(Date.now() - 3 * 3600000).toISOString(), blocked: true, source: '185.220.101.1' },
      { id: 'threat-005', type: 'INJECTION', severity: 'HIGH', description: 'SQL injection pattern detected in search query', timestamp: new Date(Date.now() - 5 * 3600000).toISOString(), blocked: true, source: '45.227.11.3' },
    ];

    const monitors = [
      { id: 'mon-1', name: 'Injection Detection', status: 'active', lastTriggered: new Date(Date.now() - 12 * 60000).toISOString() },
      { id: 'mon-2', name: 'Fraud Detection', status: 'active', lastTriggered: new Date(Date.now() - 47 * 60000).toISOString() },
      { id: 'mon-3', name: 'Rate Limit Monitor', status: 'active', lastTriggered: new Date(Date.now() - 3 * 3600000).toISOString() },
      { id: 'mon-4', name: 'Geolocation Anomaly', status: 'active', lastTriggered: new Date(Date.now() - 86400000).toISOString() },
    ];

    const blockedIPs = [
      { ip: '45.227.11.3', reason: 'Multiple injection attempts', blockedAt: new Date(Date.now() - 1800000).toISOString() },
      { ip: '203.0.113.42', reason: 'Suspicious financial activity', blockedAt: new Date(Date.now() - 47 * 60000).toISOString() },
      { ip: '185.220.101.1', reason: 'Rate limit abuse', blockedAt: new Date(Date.now() - 3 * 3600000).toISOString() },
    ];

    return success({ threats, monitors, blockedIPs });
  });
}
