export interface OrgPolicy {
  id: string;
  entityId: string;
  name: string;
  type: 'RETENTION' | 'SHARING' | 'COMPLIANCE' | 'ACCESS' | 'DLP';
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SSOConfig {
  entityId: string;
  provider: 'SAML' | 'OIDC' | 'NONE';
  issuerUrl?: string;
  clientId?: string;
  certificateFingerprint?: string;
  isEnabled: boolean;
}

export interface DLPRule {
  id: string;
  entityId: string;
  name: string;
  pattern: string;
  action: 'BLOCK' | 'WARN' | 'LOG' | 'REDACT';
  scope: 'OUTBOUND_MESSAGES' | 'DOCUMENTS' | 'ALL';
  isActive: boolean;
}

export interface EDiscoveryExport {
  id: string;
  entityId: string;
  requestedBy: string;
  dateRange: { start: Date; end: Date };
  dataTypes: string[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  downloadUrl?: string;
  requestedAt: Date;
  completedAt?: Date;
}
