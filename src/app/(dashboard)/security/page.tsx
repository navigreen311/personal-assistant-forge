'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

type TabId =
  | 'dashboard'
  | 'rbac'
  | 'audit'
  | 'accesslog'
  | 'classification'
  | 'compliance'
  | 'consent'
  | 'encryption'
  | 'threats'
  | 'backup';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

interface StatsData {
  totalAuditEvents: number;
  activeConsents: number;
  threatScore: number;
  complianceScore: number;
}

interface RolePermissionMap {
  role: string;
  permissions: string[];
}

interface UserRoleAssignment {
  userId: string;
  name: string;
  role: string;
  entity: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  resourceId: string;
  entityId: string;
  statusCode: number;
  sensitivityLevel: string;
  ipAddress?: string;
}

interface ClassificationLevel {
  level: string;
  description: string;
  count: number;
  color: string;
}

interface ComplianceEntity {
  entityId: string;
  entityName: string;
  profiles: string[];
  status: 'COMPLIANT' | 'AT_RISK' | 'NON_COMPLIANT';
  score: number;
  findings: number;
}

interface ConsentReceipt {
  id: string;
  contactId: string;
  entityId: string;
  consentType: string;
  status: string;
  grantedAt?: string;
  expiresAt?: string;
  purpose: string;
}

interface VaultHealth {
  totalEntries: number;
  algorithm: string;
  keyRotationDays: number;
  lastRotation: string | null;
  categoryCounts: Record<string, number>;
  healthy: boolean;
}

interface ThreatEvent {
  id: string;
  type: 'FRAUD' | 'INJECTION' | 'IMPERSONATION' | 'RATE_LIMIT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  timestamp: string;
  blocked: boolean;
  details?: Record<string, unknown>;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  detail?: string;
}

interface SecurityEvent {
  time: string;
  event: string;
  severity: 'info' | 'warning' | 'critical';
  details: string;
}

interface AccessLogEntry {
  id: string;
  time: string;
  user: string;
  action: string;
  ipAddress: string;
  location: string;
  status: 'success' | 'failed' | 'blocked';
}

interface AutoBlockRule {
  id: string;
  label: string;
  enabled: boolean;
}

interface BackupEntry {
  id: string;
  date: string;
  size: string;
  duration: string;
  status: 'completed' | 'failed' | 'in_progress';
}

// ============================================================================
// Tab definitions
// ============================================================================

const TABS: Tab[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: 'rbac',
    label: 'RBAC',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'audit',
    label: 'Audit Log',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
  },
  {
    id: 'accesslog',
    label: 'Access Log',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
    ),
  },
  {
    id: 'classification',
    label: 'Data Classification',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'consent',
    label: 'Consent',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'encryption',
    label: 'Encryption',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: 'threats',
    label: 'Threats',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    id: 'backup',
    label: 'Backup & Recovery',
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
    ),
  },
];

const DEMO_ENTITY_ID = 'demo-entity';

// ============================================================================
// Mock data generators
// ============================================================================

function generateMockStats(): StatsData {
  return { totalAuditEvents: 12847, activeConsents: 342, threatScore: 18, complianceScore: 87 };
}

function generateMockRoles(): RolePermissionMap[] {
  return [
    { role: 'owner', permissions: ['entity:*', 'contact:*', 'task:*', 'project:*', 'message:*', 'calendar:*', 'workflow:*', 'financial:*', 'settings:*', 'user:manage'] },
    { role: 'admin', permissions: ['entity:*', 'contact:*', 'task:*', 'project:*', 'message:*', 'calendar:*', 'workflow:*', 'financial:*', 'settings:*'] },
    { role: 'member', permissions: ['entity:read', 'contact:create', 'contact:read', 'contact:update', 'task:create', 'task:read', 'task:update', 'project:read', 'message:create', 'message:read', 'message:update', 'message:send', 'calendar:create', 'calendar:read', 'calendar:update', 'workflow:read', 'financial:read', 'settings:read'] },
    { role: 'viewer', permissions: ['entity:read', 'contact:read', 'task:read', 'project:read', 'message:read', 'calendar:read', 'workflow:read', 'financial:read', 'settings:read'] },
  ];
}

function generateMockUserAssignments(): UserRoleAssignment[] {
  return [
    { userId: 'usr-001', name: 'Alex Johnson', role: 'owner', entity: 'Johnson LLC' },
    { userId: 'usr-002', name: 'Maria Garcia', role: 'admin', entity: 'Johnson LLC' },
    { userId: 'usr-003', name: 'David Kim', role: 'member', entity: 'Johnson LLC' },
    { userId: 'usr-004', name: 'Sarah Chen', role: 'member', entity: 'Johnson LLC' },
    { userId: 'usr-005', name: 'Robert Taylor', role: 'viewer', entity: 'Johnson LLC' },
    { userId: 'usr-006', name: 'Emily Davis', role: 'admin', entity: 'Davis Corp' },
    { userId: 'usr-007', name: 'James Wilson', role: 'member', entity: 'Davis Corp' },
  ];
}

function generateMockAuditEntries(): AuditEntry[] {
  const actions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'LOGIN', 'LOGOUT', 'PERMISSION_CHANGE'];
  const resources = ['Contact', 'Task', 'Message', 'Document', 'Workflow', 'CalendarEvent', 'VaultEntry', 'User'];
  const actors = ['system', 'alex@johnson.com', 'maria@johnson.com', 'ai-agent', 'david@johnson.com'];
  const sens = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];
  const entries: AuditEntry[] = [];
  for (let i = 0; i < 50; i++) {
    const date = new Date();
    date.setMinutes(date.getMinutes() - i * 17);
    entries.push({
      id: `audit-${String(i).padStart(4, '0')}`,
      timestamp: date.toISOString(),
      actor: actors[i % actors.length],
      action: actions[i % actions.length],
      resource: resources[i % resources.length],
      resourceId: `res-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      entityId: DEMO_ENTITY_ID,
      statusCode: i % 7 === 0 ? 403 : i % 11 === 0 ? 500 : 200,
      sensitivityLevel: sens[i % sens.length],
      ipAddress: `192.168.1.${(i % 254) + 1}`,
    });
  }
  return entries;
}

function generateMockClassification(): ClassificationLevel[] {
  return [
    { level: 'PUBLIC', description: 'Publicly available data with no restrictions', count: 1247, color: 'bg-green-100 text-green-800' },
    { level: 'INTERNAL', description: 'Internal use only, not for external sharing', count: 3892, color: 'bg-blue-100 text-blue-800' },
    { level: 'CONFIDENTIAL', description: 'Sensitive business data requiring protection', count: 891, color: 'bg-yellow-100 text-yellow-800' },
    { level: 'RESTRICTED', description: 'Highly sensitive data with strict access controls', count: 234, color: 'bg-orange-100 text-orange-800' },
    { level: 'REGULATED', description: 'Data subject to regulatory compliance (HIPAA, PCI, etc.)', count: 156, color: 'bg-red-100 text-red-800' },
  ];
}

function generateMockCompliance(): ComplianceEntity[] {
  return [
    { entityId: 'ent-001', entityName: 'Johnson LLC', profiles: ['HIPAA', 'GDPR'], status: 'COMPLIANT', score: 92, findings: 2 },
    { entityId: 'ent-002', entityName: 'Davis Corp', profiles: ['CCPA', 'SOX'], status: 'AT_RISK', score: 68, findings: 5 },
    { entityId: 'ent-003', entityName: 'Wilson Medical', profiles: ['HIPAA'], status: 'COMPLIANT', score: 88, findings: 3 },
    { entityId: 'ent-004', entityName: 'Taylor Real Estate', profiles: ['GENERAL'], status: 'COMPLIANT', score: 95, findings: 1 },
    { entityId: 'ent-005', entityName: 'Chen Financial', profiles: ['SOX', 'SEC', 'GDPR'], status: 'NON_COMPLIANT', score: 42, findings: 11 },
  ];
}

function generateMockConsents(): ConsentReceipt[] {
  const types = ['DATA_PROCESSING', 'MARKETING', 'DATA_SHARING', 'PROFILING', 'AUTOMATED_DECISIONS'];
  const statuses = ['GRANTED', 'GRANTED', 'GRANTED', 'REVOKED', 'EXPIRED'];
  const consents: ConsentReceipt[] = [];
  for (let i = 0; i < 15; i++) {
    const grantDate = new Date();
    grantDate.setDate(grantDate.getDate() - Math.floor(Math.random() * 180));
    const expireDate = new Date(grantDate);
    expireDate.setFullYear(expireDate.getFullYear() + 1);
    consents.push({
      id: `consent-${String(i).padStart(3, '0')}`,
      contactId: `contact-${String(i % 8).padStart(3, '0')}`,
      entityId: DEMO_ENTITY_ID,
      consentType: types[i % types.length],
      status: statuses[i % statuses.length],
      grantedAt: grantDate.toISOString(),
      expiresAt: expireDate.toISOString(),
      purpose: `${types[i % types.length].replace(/_/g, ' ').toLowerCase()} for business operations`,
    });
  }
  return consents;
}

function generateMockVaultHealth(): VaultHealth {
  return {
    totalEntries: 47, algorithm: 'AES-256-GCM', keyRotationDays: 90,
    lastRotation: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000).toISOString(),
    categoryCounts: { PASSWORD: 12, FINANCIAL: 8, MEDICAL: 6, LEGAL: 9, PERSONAL: 7, API_KEY: 5 },
    healthy: true,
  };
}

function generateMockChecklist(): ChecklistItem[] {
  return [
    { id: '1', label: 'Two-factor authentication enabled', status: 'pass' },
    { id: '2', label: 'API keys stored in environment variables', status: 'pass' },
    { id: '3', label: 'Database connection encrypted (SSL)', status: 'pass' },
    { id: '4', label: 'Password last changed: 45 days ago', status: 'warning', detail: 'Recommend changing every 90 days' },
    { id: '5', label: 'Backup encryption key configured', status: 'fail' },
    { id: '6', label: 'Session timeout configured', status: 'fail' },
  ];
}

function generateMockSecurityEvents(): SecurityEvent[] {
  return [
    { time: new Date().toISOString(), event: 'Login success', severity: 'info', details: 'IP: 72.x.x.x' },
    { time: new Date(Date.now() - 2 * 86400000).toISOString(), event: 'Failed login', severity: 'warning', details: 'IP: 45.x.x.x' },
    { time: new Date(Date.now() - 7 * 86400000).toISOString(), event: 'Breach detected', severity: 'critical', details: 'See Crisis module' },
    { time: new Date(Date.now() - 10 * 86400000).toISOString(), event: 'Password changed', severity: 'info', details: 'User: alex@johnson.com' },
    { time: new Date(Date.now() - 14 * 86400000).toISOString(), event: 'New device login', severity: 'warning', details: 'Device: MacBook Pro, IP: 98.x.x.x' },
  ];
}

function generateMockAccessLog(): AccessLogEntry[] {
  return [
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
}

function generateMockAutoBlockRules(): AutoBlockRule[] {
  return [
    { id: 'rule-1', label: 'Block IP after 5 failed login attempts', enabled: true },
    { id: 'rule-2', label: 'Alert on login from new country', enabled: true },
    { id: 'rule-3', label: 'Alert on login outside business hours', enabled: false },
  ];
}

function generateMockBackups(): BackupEntry[] {
  return [
    { id: 'bk-001', date: new Date(Date.now() - 7200000).toISOString(), size: '2.4 GB', duration: '12 min', status: 'completed' },
    { id: 'bk-002', date: new Date(Date.now() - 86400000).toISOString(), size: '2.3 GB', duration: '11 min', status: 'completed' },
    { id: 'bk-003', date: new Date(Date.now() - 172800000).toISOString(), size: '2.3 GB', duration: '13 min', status: 'completed' },
    { id: 'bk-004', date: new Date(Date.now() - 259200000).toISOString(), size: '2.2 GB', duration: '10 min', status: 'completed' },
    { id: 'bk-005', date: new Date(Date.now() - 345600000).toISOString(), size: '2.2 GB', duration: '14 min', status: 'failed' },
  ];
}

function generateMockThreats(): ThreatEvent[] {
  return [
    { id: 'threat-001', type: 'INJECTION', severity: 'HIGH', description: 'Prompt injection attempt detected in message input', timestamp: new Date(Date.now() - 12 * 60000).toISOString(), blocked: true, details: { pattern: 'IGNORE_INSTRUCTIONS' } },
    { id: 'threat-002', type: 'FRAUD', severity: 'CRITICAL', description: 'Suspicious bulk financial operation detected', timestamp: new Date(Date.now() - 47 * 60000).toISOString(), blocked: true, details: { actionType: 'BULK_TRANSFER', amount: 50000 } },
    { id: 'threat-003', type: 'IMPERSONATION', severity: 'MEDIUM', description: 'Email header mismatch detected - possible spoofing', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), blocked: false, details: { from: 'ceo@company.com', actualSender: 'attacker@malicious.net' } },
    { id: 'threat-004', type: 'RATE_LIMIT', severity: 'LOW', description: 'Rate limit exceeded for API endpoint /api/contacts', timestamp: new Date(Date.now() - 3 * 3600000).toISOString(), blocked: true, details: { endpoint: '/api/contacts', requestsPerMinute: 150 } },
    { id: 'threat-005', type: 'INJECTION', severity: 'HIGH', description: 'SQL injection pattern detected in search query', timestamp: new Date(Date.now() - 5 * 3600000).toISOString(), blocked: true, details: { pattern: 'SQL_INJECTION' } },
    { id: 'threat-006', type: 'FRAUD', severity: 'MEDIUM', description: 'Unusual access pattern from new IP address after hours', timestamp: new Date(Date.now() - 8 * 3600000).toISOString(), blocked: false, details: { ip: '203.0.113.42', time: '03:24 AM' } },
    { id: 'threat-007', type: 'IMPERSONATION', severity: 'HIGH', description: 'Voice clone detection flagged in outbound call', timestamp: new Date(Date.now() - 12 * 3600000).toISOString(), blocked: true, details: { callId: 'call-892', confidence: 0.89 } },
  ];
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function severityColor(s: string): string {
  const map: Record<string, string> = { LOW: 'bg-blue-100 text-blue-800', MEDIUM: 'bg-yellow-100 text-yellow-800', HIGH: 'bg-orange-100 text-orange-800', CRITICAL: 'bg-red-100 text-red-800' };
  return map[s] || 'bg-gray-100 text-gray-800';
}

function statusColor(s: string): string {
  const map: Record<string, string> = { COMPLIANT: 'bg-green-100 text-green-800', AT_RISK: 'bg-yellow-100 text-yellow-800', NON_COMPLIANT: 'bg-red-100 text-red-800', GRANTED: 'bg-green-100 text-green-800', REVOKED: 'bg-red-100 text-red-800', EXPIRED: 'bg-gray-100 text-gray-600', PENDING: 'bg-blue-100 text-blue-800' };
  return map[s] || 'bg-gray-100 text-gray-800';
}

function httpStatusColor(code: number): string {
  if (code >= 200 && code < 300) return 'text-green-600';
  if (code >= 400 && code < 500) return 'text-yellow-600';
  return 'text-red-600';
}

function sensitivityBadgeColor(level: string): string {
  if (level === 'RESTRICTED' || level === 'REGULATED') return 'bg-red-100 text-red-800';
  if (level === 'CONFIDENTIAL') return 'bg-yellow-100 text-yellow-800';
  if (level === 'INTERNAL') return 'bg-blue-100 text-blue-800';
  return 'bg-green-100 text-green-800';
}

function classificationBarColor(level: string): string {
  const map: Record<string, string> = { PUBLIC: 'bg-green-400', INTERNAL: 'bg-blue-400', CONFIDENTIAL: 'bg-yellow-400', RESTRICTED: 'bg-orange-400', REGULATED: 'bg-red-400' };
  return map[level] || 'bg-gray-400';
}

function roleBadgeColor(role: string): string {
  const map: Record<string, string> = { owner: 'bg-purple-100 text-purple-800', admin: 'bg-blue-100 text-blue-800', member: 'bg-green-100 text-green-800' };
  return map[role] || 'bg-gray-100 text-gray-800';
}

function threatIcon(type: string): string {
  const map: Record<string, string> = { FRAUD: 'F', INJECTION: 'I', IMPERSONATION: 'S', RATE_LIMIT: 'R' };
  return map[type] || '?';
}

function threatIconBg(type: string): string {
  const map: Record<string, string> = { FRAUD: 'bg-red-100 text-red-700', INJECTION: 'bg-orange-100 text-orange-700', IMPERSONATION: 'bg-purple-100 text-purple-700', RATE_LIMIT: 'bg-blue-100 text-blue-700' };
  return map[type] || 'bg-gray-100 text-gray-700';
}

function vaultCatColor(cat: string): string {
  const map: Record<string, string> = { PASSWORD: 'bg-purple-400', FINANCIAL: 'bg-green-400', MEDICAL: 'bg-red-400', LEGAL: 'bg-blue-400', PERSONAL: 'bg-yellow-400' };
  return map[cat] || 'bg-gray-400';
}

// ============================================================================
// StatsCards Component
// ============================================================================

function StatsCards({ stats, loading }: { stats: StatsData | null; loading: boolean }) {
  const cards = [
    { label: 'Total Audit Events', value: stats?.totalAuditEvents ?? 0, bgColor: 'bg-blue-50', textColor: 'text-blue-600', icon: <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg> },
    { label: 'Active Consents', value: stats?.activeConsents ?? 0, bgColor: 'bg-green-50', textColor: 'text-green-600', icon: <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
    { label: 'Threat Score', value: stats?.threatScore ?? 0, suffix: '/100', bgColor: stats && stats.threatScore > 50 ? 'bg-red-50' : stats && stats.threatScore > 25 ? 'bg-yellow-50' : 'bg-green-50', textColor: stats && stats.threatScore > 50 ? 'text-red-600' : stats && stats.threatScore > 25 ? 'text-yellow-600' : 'text-green-600', icon: <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> },
    { label: 'Compliance Score', value: stats?.complianceScore ?? 0, suffix: '/100', bgColor: stats && stats.complianceScore >= 80 ? 'bg-green-50' : stats && stats.complianceScore >= 50 ? 'bg-yellow-50' : 'bg-red-50', textColor: stats && stats.complianceScore >= 80 ? 'text-green-600' : stats && stats.complianceScore >= 50 ? 'text-yellow-600' : 'text-red-600', icon: <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-xl border border-gray-200 ${card.bgColor} p-5 transition-shadow hover:shadow-md`}>
          <div className={`${card.textColor} mb-3`}>{card.icon}</div>
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
          ) : (
            <p className={`text-3xl font-bold ${card.textColor}`}>
              {card.value.toLocaleString()}
              {card.suffix && <span className="text-lg font-normal opacity-60">{card.suffix}</span>}
            </p>
          )}
          <p className="mt-1 text-sm font-medium text-gray-600">{card.label}</p>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// RBAC Panel
// ============================================================================

function RBACPanel() {
  const [roles] = useState<RolePermissionMap[]>(generateMockRoles);
  const [users] = useState<UserRoleAssignment[]>(generateMockUserAssignments);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-md font-semibold text-gray-800 mb-3">Roles &amp; Permissions</h3>
        <div className="space-y-2">
          {roles.map((r) => (
            <div key={r.role} className="rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => setExpandedRole(expandedRole === r.role ? null : r.role)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadgeColor(r.role)}`}>
                    {r.role.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-600">{r.permissions.length} permissions</span>
                </div>
                <svg className={`h-5 w-5 text-gray-400 transition-transform ${expandedRole === r.role ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedRole === r.role && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {r.permissions.map((perm) => (
                      <span key={perm} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700">{perm}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-md font-semibold text-gray-800 mb-3">User Role Assignments</h3>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.userId} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                        {u.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{u.name}</p>
                        <p className="text-xs text-gray-500">{u.userId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadgeColor(u.role)}`}>{u.role}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{u.entity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Audit Log Viewer
// ============================================================================

function AuditLogViewer() {
  const [entries] = useState<AuditEntry[]>(generateMockAuditEntries);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSensitivity, setFilterSensitivity] = useState('');

  const filteredEntries = entries.filter((entry) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || entry.actor.toLowerCase().includes(q) || entry.resource.toLowerCase().includes(q) || entry.action.toLowerCase().includes(q) || entry.resourceId.toLowerCase().includes(q);
    return matchesSearch && (!filterAction || entry.action === filterAction) && (!filterSensitivity || entry.sensitivityLevel === filterSensitivity);
  });

  const uniqueActions = [...new Set(entries.map(e => e.action))].sort();
  const uniqueSensitivities = [...new Set(entries.map(e => e.sensitivityLevel))];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <input type="text" placeholder="Search by actor, resource, action..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All Actions</option>
          {uniqueActions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterSensitivity} onChange={(e) => setFilterSensitivity(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All Sensitivity</option>
          {uniqueSensitivities.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <p className="text-xs text-gray-500">Showing {filteredEntries.length} of {entries.length} entries</p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Time</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actor</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Resource</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Sensitivity</th>
              <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 lg:table-cell">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredEntries.slice(0, 25).map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{formatTimestamp(entry.timestamp)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm text-gray-900">{entry.actor}</td>
                <td className="whitespace-nowrap px-3 py-2.5"><span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-mono font-medium text-gray-700">{entry.action}</span></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm text-gray-600">{entry.resource} <span className="text-xs text-gray-400">{entry.resourceId}</span></td>
                <td className="whitespace-nowrap px-3 py-2.5"><span className={`text-sm font-mono font-medium ${httpStatusColor(entry.statusCode)}`}>{entry.statusCode}</span></td>
                <td className="whitespace-nowrap px-3 py-2.5"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sensitivityBadgeColor(entry.sensitivityLevel)}`}>{entry.sensitivityLevel}</span></td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-gray-400 lg:table-cell">{entry.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredEntries.length > 25 && (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
            Showing 25 of {filteredEntries.length} results. Refine your search to narrow results.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Data Classification Panel
// ============================================================================

function ClassificationPanel() {
  const [levels] = useState<ClassificationLevel[]>(generateMockClassification);
  const totalRecords = levels.reduce((sum, l) => sum + l.count, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-md font-semibold text-gray-800 mb-4">Classification Distribution</h3>
        <div className="mb-3 flex h-4 overflow-hidden rounded-full bg-gray-100">
          {levels.map((level) => (
            <div key={level.level} className={`${classificationBarColor(level.level)} transition-all`} style={{ width: `${(level.count / totalRecords) * 100}%` }} title={`${level.level}: ${level.count}`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          {levels.map((level) => (
            <div key={level.level} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${classificationBarColor(level.level)}`} />
              {level.level} ({level.count})
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((level) => (
          <div key={level.level} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${level.color}`}>{level.level}</span>
              <span className="text-lg font-bold text-gray-900">{level.count.toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-500">{level.description}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${classificationBarColor(level.level)}`} style={{ width: `${(level.count / totalRecords) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Compliance Status Panel
// ============================================================================

function CompliancePanel() {
  const [entities] = useState<ComplianceEntity[]>(generateMockCompliance);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Profiles</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Score</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Findings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entities.map((ent) => (
              <tr key={ent.entityId} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{ent.entityName}</p>
                  <p className="text-xs text-gray-400">{ent.entityId}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {ent.profiles.map((p) => <span key={p} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{p}</span>)}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(ent.status)}`}>{ent.status.replace(/_/g, ' ')}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                      <div className={`h-full rounded-full ${ent.score >= 80 ? 'bg-green-500' : ent.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${ent.score}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-700">{ent.score}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`text-sm font-medium ${ent.findings > 5 ? 'text-red-600' : ent.findings > 2 ? 'text-yellow-600' : 'text-gray-600'}`}>{ent.findings}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Consent Management Panel
// ============================================================================

function ConsentPanel() {
  const [consents, setConsents] = useState<ConsentReceipt[]>(generateMockConsents);
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleRevoke = useCallback(async (id: string) => {
    setRevoking(id);
    await new Promise((r) => setTimeout(r, 800));
    setConsents((prev) => prev.map((c) => c.id === id ? { ...c, status: 'REVOKED' } : c));
    setRevoking(null);
  }, []);

  const activeCount = consents.filter(c => c.status === 'GRANTED').length;
  const revokedCount = consents.filter(c => c.status === 'REVOKED').length;
  const expiredCount = consents.filter(c => c.status === 'EXPIRED').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          <p className="text-xs text-gray-500 mt-1">Active</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{revokedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Revoked</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-500">{expiredCount}</p>
          <p className="text-xs text-gray-500 mt-1">Expired</p>
        </div>
      </div>

      <div className="space-y-2">
        {consents.map((consent) => (
          <div key={consent.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(consent.status)}`}>{consent.status}</span>
                <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700">{consent.consentType}</span>
              </div>
              <p className="mt-1 text-sm text-gray-600 truncate">{consent.purpose}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                <span>Contact: {consent.contactId}</span>
                {consent.grantedAt && <span>Granted: {formatTimestamp(consent.grantedAt)}</span>}
                {consent.expiresAt && <span>Expires: {formatTimestamp(consent.expiresAt)}</span>}
              </div>
            </div>
            {consent.status === 'GRANTED' && (
              <button onClick={() => handleRevoke(consent.id)} disabled={revoking === consent.id} className="ml-4 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors">
                {revoking === consent.id ? 'Revoking...' : 'Revoke'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Encryption Status Panel
// ============================================================================

function EncryptionPanel() {
  const [vault] = useState<VaultHealth>(generateMockVaultHealth);
  const [now] = useState(() => Date.now());
  const daysSinceRotation = vault.lastRotation ? Math.floor((now - new Date(vault.lastRotation).getTime()) / (24 * 3600000)) : null;
  const rotationPctUsed = daysSinceRotation !== null ? Math.min((daysSinceRotation / vault.keyRotationDays) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Vault Status</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${vault.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-lg font-semibold text-gray-900">{vault.healthy ? 'Healthy' : 'Degraded'}</span>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Algorithm</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 font-mono">{vault.algorithm}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Entries</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">{vault.totalEntries}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-md font-semibold text-gray-800 mb-4">Key Rotation Status</h3>
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Last rotated: {daysSinceRotation !== null ? `${daysSinceRotation} days ago` : 'Never'}</span>
          <span>Next rotation in: {daysSinceRotation !== null ? `${Math.max(0, vault.keyRotationDays - daysSinceRotation)} days` : 'N/A'}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-200">
          <div className={`h-full rounded-full transition-all ${rotationPctUsed > 90 ? 'bg-red-500' : rotationPctUsed > 70 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${rotationPctUsed}%` }} />
        </div>
        <p className="mt-2 text-xs text-gray-400">Rotation policy: every {vault.keyRotationDays} days</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-md font-semibold text-gray-800 mb-4">Vault Entries by Category</h3>
        <div className="space-y-3">
          {Object.entries(vault.categoryCounts).map(([category, count]) => (
            <div key={category}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-700">{category}</span>
                <span className="text-gray-500">{count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${vaultCatColor(category)}`} style={{ width: `${(count / vault.totalEntries) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Threat Detection Panel
// ============================================================================

function ThreatPanel() {
  const [threats] = useState<ThreatEvent[]>(generateMockThreats);
  const criticalCount = threats.filter(t => t.severity === 'CRITICAL').length;
  const highCount = threats.filter(t => t.severity === 'HIGH').length;
  const blockedCount = threats.filter(t => t.blocked).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{threats.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Events</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
          <p className="text-xs text-gray-500 mt-1">Critical</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{highCount}</p>
          <p className="text-xs text-gray-500 mt-1">High</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{blockedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Blocked</p>
        </div>
      </div>

      <div className="space-y-2">
        {threats.map((threat) => (
          <div key={threat.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${threatIconBg(threat.type)}`}>
                {threatIcon(threat.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${severityColor(threat.severity)}`}>{threat.severity}</span>
                  <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{threat.type}</span>
                  {threat.blocked ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">BLOCKED</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">DETECTED</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-700">{threat.description}</p>
                <p className="mt-1 text-xs text-gray-400">{formatRelativeTime(threat.timestamp)}</p>
              </div>
            </div>
            {threat.details && (
              <div className="mt-3 rounded bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Details</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 font-mono">
                  {Object.entries(threat.details).map(([key, value]) => (
                    <span key={key}>
                      <span className="text-gray-400">{key}:</span>{' '}
                      {typeof value === 'string' && value.length > 40 ? value.slice(0, 40) + '...' : String(value)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Security Dashboard Panel (Overview)
// ============================================================================

function SecurityDashboardPanel() {
  const [checklist] = useState<ChecklistItem[]>(generateMockChecklist);
  const [events] = useState<SecurityEvent[]>(generateMockSecurityEvents);

  const passCount = checklist.filter(c => c.status === 'pass').length;
  const securityScore = Math.round((passCount / checklist.length) * 100);

  const statusIcon = (status: ChecklistItem['status']) => {
    switch (status) {
      case 'pass': return <span className="text-green-500 text-lg">&#10003;</span>;
      case 'warning': return <span className="text-yellow-500 text-lg">&#9888;</span>;
      case 'fail': return <span className="text-red-500 text-lg">&#10007;</span>;
    }
  };

  const eventSeverityColor = (severity: SecurityEvent['severity']) => {
    switch (severity) {
      case 'info': return 'bg-blue-100 text-blue-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'critical': return 'bg-red-100 text-red-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Score */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-md font-semibold text-gray-800 mb-4">Security Score</h3>
          <div className="flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <svg className="h-32 w-32" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0-31.831"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0-31.831"
                  fill="none"
                  stroke={securityScore >= 80 ? '#22c55e' : securityScore >= 50 ? '#eab308' : '#ef4444'}
                  strokeWidth="3"
                  strokeDasharray={`${securityScore}, 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-bold text-gray-900">{securityScore}</span>
                <span className="text-xs text-gray-500">/100</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-lg font-bold text-green-600">{passCount}</p>
              <p className="text-gray-500">Passed</p>
            </div>
            <div>
              <p className="text-lg font-bold text-yellow-600">{checklist.filter(c => c.status === 'warning').length}</p>
              <p className="text-gray-500">Warnings</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-600">{checklist.filter(c => c.status === 'fail').length}</p>
              <p className="text-gray-500">Failed</p>
            </div>
          </div>
        </div>

        {/* Security Checklist */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-gray-800">Security Checklist</h3>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              Fix all issues
            </button>
          </div>
          <div className="space-y-3">
            {checklist.map((item) => (
              <div key={item.id} className={`flex items-start gap-3 rounded-lg border p-3 ${
                item.status === 'pass' ? 'border-green-200 bg-green-50' :
                item.status === 'warning' ? 'border-yellow-200 bg-yellow-50' :
                'border-red-200 bg-red-50'
              }`}>
                <div className="mt-0.5 shrink-0">{statusIcon(item.status)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  {item.detail && <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Failed Logins (30d)</p>
          <p className="mt-2 text-2xl font-bold text-orange-600">3</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Active Sessions</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">1</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Last Backup</p>
          <p className="mt-2 text-2xl font-bold text-green-600">2h ago</p>
        </div>
      </div>

      {/* Recent Security Events */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-md font-semibold text-gray-800 mb-4">Recent Security Events</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Event</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((evt, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{formatRelativeTime(evt.time)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{evt.event}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${eventSeverityColor(evt.severity)}`}>
                      {evt.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{evt.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Access Log Panel
// ============================================================================

function AccessLogPanel() {
  const [entries] = useState<AccessLogEntry[]>(generateMockAccessLog);
  const [rules, setRules] = useState<AutoBlockRule[]>(generateMockAutoBlockRules);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [dateRange, setDateRange] = useState('all');

  const toggleRule = useCallback((ruleId: string) => {
    setRules((prev) => prev.map((r) => r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
  }, []);

  const accessStatusColor = (status: AccessLogEntry['status']) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-yellow-100 text-yellow-800';
      case 'blocked': return 'bg-red-100 text-red-800';
    }
  };

  const filteredEntries = entries.filter((entry) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || entry.user.toLowerCase().includes(q) || entry.action.toLowerCase().includes(q) || entry.ipAddress.includes(q) || entry.location.toLowerCase().includes(q);
    const matchesSeverity = !severityFilter || entry.status === severityFilter;
    let matchesDate = true;
    if (dateRange === '24h') {
      matchesDate = Date.now() - new Date(entry.time).getTime() < 86400000;
    } else if (dateRange === '7d') {
      matchesDate = Date.now() - new Date(entry.time).getTime() < 7 * 86400000;
    } else if (dateRange === '30d') {
      matchesDate = Date.now() - new Date(entry.time).getTime() < 30 * 86400000;
    }
    return matchesSearch && matchesSeverity && matchesDate;
  });

  const exportCsv = useCallback(() => {
    const headers = ['Time', 'User', 'Action', 'IP Address', 'Location', 'Status'];
    const rows = filteredEntries.map(e => [
      new Date(e.time).toISOString(), e.user, e.action, e.ipAddress, e.location, e.status,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `access-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEntries]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <input type="text" placeholder="Search by user, action, IP, location..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
        </select>
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="all">All Time</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <button onClick={exportCsv} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          Export CSV
        </button>
      </div>

      <p className="text-xs text-gray-500">Showing {filteredEntries.length} of {entries.length} entries</p>

      {/* Access Log Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Time</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">IP Address</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Location</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{formatTimestamp(entry.time)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm text-gray-900">{entry.user}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm text-gray-600">{entry.action}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm font-mono text-gray-600">{entry.ipAddress}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm text-gray-600">{entry.location}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${accessStatusColor(entry.status)}`}>
                    {entry.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Auto-Block Rules */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-md font-semibold text-gray-800 mb-4">Auto-Block Rules</h3>
        <div className="space-y-3">
          {rules.map((rule) => (
            <label key={rule.id} className="flex items-center gap-3 cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={() => toggleRule(rule.id)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{rule.label}</span>
              <span className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {rule.enabled ? 'Active' : 'Inactive'}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Backup & Recovery Panel
// ============================================================================

function BackupPanel() {
  const [backups] = useState<BackupEntry[]>(generateMockBackups);
  const [backupRunning, setBackupRunning] = useState(false);
  const [frequency, setFrequency] = useState('daily');
  const [retention, setRetention] = useState('30');
  const [destination, setDestination] = useState('s3');

  const handleRunBackup = useCallback(async () => {
    setBackupRunning(true);
    await new Promise((r) => setTimeout(r, 2000));
    setBackupRunning(false);
  }, []);

  const backupStatusColor = (status: BackupEntry['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Run Backup + Schedule */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-md font-semibold text-gray-800 mb-4">Run Backup</h3>
          <p className="text-sm text-gray-600 mb-4">Trigger an immediate full backup of all data.</p>
          <button
            onClick={handleRunBackup}
            disabled={backupRunning}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {backupRunning ? 'Backup in progress...' : 'Run Backup Now'}
          </button>
          {backupRunning && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-blue-500 animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="mt-1 text-xs text-gray-500">Backing up data...</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-md font-semibold text-gray-800 mb-4">Backup Schedule</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Retention Period</label>
              <select value={retention} onChange={(e) => setRetention(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Destination</label>
              <select value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="s3">AWS S3</option>
                <option value="gcs">Google Cloud Storage</option>
                <option value="azure">Azure Blob Storage</option>
                <option value="local">Local Storage</option>
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
              <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm text-green-800">Encryption enabled (AES-256)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Backups Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-md font-semibold text-gray-800 mb-4">Recent Backups</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {backups.map((backup) => (
                <tr key={backup.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{formatTimestamp(backup.date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{backup.size}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{backup.duration}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${backupStatusColor(backup.status)}`}>
                      {backup.status.toUpperCase().replace('_', ' ')}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex gap-2">
                      {backup.status === 'completed' && (
                        <>
                          <button className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                            Restore
                          </button>
                          <button className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                            Download
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disaster Recovery */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-md font-semibold text-gray-800 mb-4">Disaster Recovery</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">RPO (Recovery Point Objective)</p>
            <p className="mt-2 text-lg font-bold text-gray-900">24 hours</p>
            <p className="text-xs text-gray-500 mt-1">Maximum data loss tolerance</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">RTO (Recovery Time Objective)</p>
            <p className="mt-2 text-lg font-bold text-gray-900">~15 minutes</p>
            <p className="text-xs text-gray-500 mt-1">Target recovery time</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Last Recovery Test</p>
            <p className="mt-2 text-lg font-bold text-gray-900">30 days ago</p>
            <p className="text-xs text-green-600 mt-1">Result: Passed</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 flex flex-col justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Recovery Drill</p>
            <button className="mt-3 w-full rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 transition-colors">
              Run recovery drill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function SecurityDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.allSettled([
          fetch('/api/safety/reputation?entityId=' + DEMO_ENTITY_ID),
          fetch('/api/admin/policies?entityId=' + DEMO_ENTITY_ID),
        ]);

        const mockStats = generateMockStats();

        if (!cancelled) {
          const repResult = results[0];
          if (repResult.status === 'fulfilled' && repResult.value.ok) {
            try {
              const data = await repResult.value.json();
              if (data?.data?.riskScore !== undefined) {
                mockStats.threatScore = Math.round(data.data.riskScore);
              }
            } catch { /* use mock */ }
          }
          setStats(mockStats);
        }
      } catch {
        if (!cancelled) setStats(generateMockStats());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStats();
    return () => { cancelled = true; };
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard': return <SecurityDashboardPanel />;
      case 'rbac': return <RBACPanel />;
      case 'audit': return <AuditLogViewer />;
      case 'accesslog': return <AccessLogPanel />;
      case 'classification': return <ClassificationPanel />;
      case 'compliance': return <CompliancePanel />;
      case 'consent': return <ConsentPanel />;
      case 'encryption': return <EncryptionPanel />;
      case 'threats': return <ThreatPanel />;
      case 'backup': return <BackupPanel />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Security Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor security posture, access logs, RBAC, data classification, compliance, consent, encryption, threats, and backups.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <div className="mb-8">
          <StatsCards stats={stats} loading={loading} />
        </div>

        <nav className="mb-6 flex overflow-x-auto border-b border-gray-200">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div>{renderTabContent()}</div>
      </div>
    </div>
  );
}