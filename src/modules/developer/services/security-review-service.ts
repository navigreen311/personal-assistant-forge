import { generateJSON } from '@/lib/ai';
import type { PluginSecurityReview } from '../types';
import { pluginStore } from './plugin-service';

const reviewStore = new Map<string, PluginSecurityReview>();

const DANGEROUS_PERMISSIONS = ['admin.all', 'system.execute', 'files.delete_all'];

export async function requestReview(pluginId: string): Promise<PluginSecurityReview> {
  const plugin = pluginStore.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  const review: PluginSecurityReview = {
    pluginId,
    reviewer: '',
    status: 'PENDING',
    permissionsVerified: false,
    isolationVerified: false,
    findings: [],
  };

  reviewStore.set(pluginId, review);
  return review;
}

export async function conductReview(
  pluginId: string,
  reviewer: string
): Promise<PluginSecurityReview> {
  const plugin = pluginStore.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  const findings: { severity: string; description: string }[] = [];

  // Check permissions are minimal
  const dangerousPerms = plugin.permissions.filter((p) => DANGEROUS_PERMISSIONS.includes(p));
  if (dangerousPerms.length > 0) {
    findings.push({
      severity: 'HIGH',
      description: `Plugin requests dangerous permissions: ${dangerousPerms.join(', ')}`,
    });
  }

  const permissionsVerified = dangerousPerms.length === 0;

  // Check isolation (placeholder: verify entry point doesn't reference system paths)
  const isolationVerified = !plugin.entryPoint.includes('..') && !plugin.entryPoint.startsWith('/');
  if (!isolationVerified) {
    findings.push({
      severity: 'CRITICAL',
      description: 'Plugin entry point may escape sandbox isolation',
    });
  }

  if (plugin.permissions.length > 10) {
    findings.push({
      severity: 'MEDIUM',
      description: 'Plugin requests more than 10 permissions. Review for least privilege.',
    });
  }

  // AI-assisted security analysis
  try {
    const aiReview = await generateJSON<{ findings: { severity: string; description: string }[] }>(
      `Perform a security review of this plugin.

Plugin: ${plugin.name} v${plugin.version}
Author: ${plugin.author}
Permissions: ${JSON.stringify(plugin.permissions)}
Entry Point: ${plugin.entryPoint}
Config Schema: ${JSON.stringify(plugin.configSchema)}

Analyze for:
1. Principle of least privilege - are permissions minimal and necessary?
2. Dangerous patterns - network access, file system access, credential access
3. Isolation enforcement - could the plugin escape its sandbox?
4. Configuration risks - could config values be exploited?

Return JSON: { "findings": [{ "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO", "description": "finding description" }] }
Only include genuine concerns, not trivial observations.`,
      { temperature: 0.1, maxTokens: 512 }
    );

    if (aiReview.findings && Array.isArray(aiReview.findings)) {
      for (const f of aiReview.findings) {
        // Avoid duplicating findings already detected by rule-based checks
        const isDuplicate = findings.some((existing) =>
          existing.description.toLowerCase().includes(f.description.toLowerCase().slice(0, 30))
        );
        if (!isDuplicate) {
          findings.push(f);
        }
      }
    }
  } catch {
    // Rule-based findings still apply if AI fails
  }

  const status = findings.some((f) => f.severity === 'CRITICAL') ? 'REJECTED' as const
    : findings.some((f) => f.severity === 'HIGH') ? 'REJECTED' as const
    : 'APPROVED' as const;

  const review: PluginSecurityReview = {
    pluginId,
    reviewer,
    status,
    permissionsVerified,
    isolationVerified,
    findings,
    reviewedAt: new Date(),
  };

  reviewStore.set(pluginId, review);
  return review;
}

export async function getReview(pluginId: string): Promise<PluginSecurityReview | null> {
  return reviewStore.get(pluginId) || null;
}

export async function breakGlassRevoke(
  pluginId: string,
  _reason: string
): Promise<{ revoked: boolean; affectedUsers: number }> {
  const plugin = pluginStore.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

  plugin.status = 'REVOKED';
  plugin.updatedAt = new Date();
  pluginStore.set(pluginId, plugin);

  // Placeholder: would query real user count
  return { revoked: true, affectedUsers: 0 };
}

export { reviewStore };
