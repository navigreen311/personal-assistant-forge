export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  permissions: string[];
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REVOKED';
  entryPoint: string;
  configSchema: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookConfig {
  id: string;
  entityId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  lastTriggered?: Date;
  failureCount: number;
  createdAt: Date;
}

export interface WebhookEvent {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'DELIVERED' | 'FAILED' | 'RETRYING';
  attempts: number;
  lastAttempt?: Date;
  response?: { status: number; body: string };
  createdAt: Date;
}

export interface CustomToolDefinition {
  id: string;
  entityId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  implementation: 'WEBHOOK' | 'FUNCTION' | 'API_CALL';
  config: Record<string, unknown>;
  isActive: boolean;
}

export interface PluginSecurityReview {
  pluginId: string;
  reviewer: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  permissionsVerified: boolean;
  isolationVerified: boolean;
  findings: { severity: string; description: string }[];
  reviewedAt?: Date;
}
