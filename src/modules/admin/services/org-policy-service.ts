import { v4 as uuidv4 } from 'uuid';
import type { OrgPolicy } from '../types';

const policyStore = new Map<string, OrgPolicy>();

export async function createPolicy(
  policy: Omit<OrgPolicy, 'id' | 'createdAt' | 'updatedAt'>
): Promise<OrgPolicy> {
  const now = new Date();
  const newPolicy: OrgPolicy = {
    ...policy,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
  };
  policyStore.set(newPolicy.id, newPolicy);
  return newPolicy;
}

export async function getPolicies(entityId: string, type?: string): Promise<OrgPolicy[]> {
  const results: OrgPolicy[] = [];
  for (const policy of policyStore.values()) {
    if (policy.entityId === entityId) {
      if (!type || policy.type === type) {
        results.push(policy);
      }
    }
  }
  return results;
}

export async function updatePolicy(
  policyId: string,
  updates: Partial<OrgPolicy>
): Promise<OrgPolicy> {
  const policy = policyStore.get(policyId);
  if (!policy) throw new Error(`Policy ${policyId} not found`);

  const updated: OrgPolicy = { ...policy, ...updates, id: policyId, updatedAt: new Date() };
  policyStore.set(policyId, updated);
  return updated;
}

export async function deletePolicy(policyId: string): Promise<void> {
  if (!policyStore.has(policyId)) throw new Error(`Policy ${policyId} not found`);
  policyStore.delete(policyId);
}

export async function enforceRetentionPolicy(
  entityId: string
): Promise<{ deletedRecords: number; retainedRecords: number }> {
  // Placeholder: simulates applying retention rules
  const policies = await getPolicies(entityId, 'RETENTION');
  const activeRetention = policies.filter((p) => p.isActive);

  return {
    deletedRecords: activeRetention.length > 0 ? 42 : 0,
    retainedRecords: 1258,
  };
}

export { policyStore };
