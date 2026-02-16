import type { PhoneTreeNode, CrisisType } from '../types';
import { getEscalationChain } from './escalation-service';

const phoneTreeStore = new Map<string, PhoneTreeNode[]>();

export async function buildPhoneTree(
  userId: string,
  crisisType: CrisisType
): Promise<PhoneTreeNode[]> {
  const chain = getEscalationChain(crisisType);

  const tree: PhoneTreeNode[] = chain.steps.map((step, index) => ({
    contactId: step.contactId ?? `contact-${index + 1}`,
    contactName: step.contactName,
    phone: `+1-555-${String(100 + index).padStart(4, '0')}`,
    order: step.order,
    role: index === 0 ? 'Primary' : index === 1 ? 'Backup' : step.contactName.includes('Legal') ? 'Legal' : 'Support',
    children: [],
  }));

  // Build hierarchy: first contact is root, others are children
  if (tree.length > 1) {
    tree[0].children = tree.slice(1);
  }

  phoneTreeStore.set(userId, tree);
  return tree;
}

export async function getPhoneTree(userId: string): Promise<PhoneTreeNode[]> {
  return phoneTreeStore.get(userId) ?? [];
}

export async function updatePhoneTree(userId: string, tree: PhoneTreeNode[]): Promise<void> {
  phoneTreeStore.set(userId, tree);
}
