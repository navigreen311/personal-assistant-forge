// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _adoptionStore = new Map<string, any>();

jest.mock('@/lib/db', () => {
  return {
    prisma: {
      adoptionProgress: {
        upsert: jest.fn().mockImplementation((args: { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const existing = _adoptionStore.get(args.where.userId);
          if (existing) {
            const updated = { ...existing, ...args.update, updatedAt: new Date() };
            _adoptionStore.set(args.where.userId, updated);
            return Promise.resolve({ ...updated });
          }
          const record = {
            id: 'adoption-' + args.where.userId,
            ...args.create,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          _adoptionStore.set(args.where.userId, record);
          return Promise.resolve({ ...record });
        }),
        findUnique: jest.fn().mockImplementation((args: { where: { userId: string } }) => {
          const rec = _adoptionStore.get(args.where.userId);
          return Promise.resolve(rec ? { ...rec } : null);
        }),
        update: jest.fn().mockImplementation((args: { where: { userId: string }; data: Record<string, unknown> }) => {
          const rec = _adoptionStore.get(args.where.userId);
          if (rec) {
            const updated = { ...rec, ...args.data, updatedAt: new Date() };
            _adoptionStore.set(args.where.userId, updated);
            return Promise.resolve({ ...updated });
          }
          return Promise.resolve(null);
        }),
      },
    },
  };
});

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI response'),
  generateJSON: jest.fn().mockResolvedValue({
    name: 'Custom Playbook',
    description: 'A custom playbook',
    category: 'productivity',
    steps: [
      { title: 'Step 1', description: 'First step', actionType: 'CONFIGURE', isOptional: false },
    ],
    estimatedTimeSavedMinutes: 15,
  }),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

import {
  getDefaultPlaybooks,
  getPlaybooks,
  getPlaybook,
  activatePlaybook,
  generatePersonalizedPlaybook,
} from '@/engines/adoption/playbook-service';

describe('playbook-service (Prisma-backed activations)', () => {
  beforeEach(() => {
    _adoptionStore.clear();
    jest.clearAllMocks();
  });

  it('should return 6 default playbooks', () => {
    const playbooks = getDefaultPlaybooks();
    expect(playbooks).toHaveLength(6);
    expect(playbooks[0].id).toBe('pb-morning-briefing');
    expect(playbooks[1].id).toBe('pb-email-triage');
  });

  it('should get all playbooks via getPlaybooks', async () => {
    const playbooks = await getPlaybooks();
    expect(playbooks).toHaveLength(6);
  });

  it('should filter playbooks by category', async () => {
    const emailPlaybooks = await getPlaybooks('email');
    expect(emailPlaybooks).toHaveLength(1);
    expect(emailPlaybooks[0].name).toBe('Email Auto-Triage');
  });

  it('should get a single playbook by id', async () => {
    const pb = await getPlaybook('pb-email-triage');
    expect(pb).not.toBeNull();
    expect(pb?.name).toBe('Email Auto-Triage');
    expect(pb?.steps).toHaveLength(4);
  });

  it('should return null for non-existent playbook', async () => {
    const pb = await getPlaybook('pb-nonexistent');
    expect(pb).toBeNull();
  });

  it('should activate a playbook and persist to database', async () => {
    const result = await activatePlaybook('user-1', 'pb-email-triage');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Email Auto-Triage');
    expect(result.message).toContain('activated');
  });

  it('should prevent duplicate activation of the same playbook', async () => {
    await activatePlaybook('user-2', 'pb-morning-briefing');
    const result = await activatePlaybook('user-2', 'pb-morning-briefing');
    expect(result.success).toBe(false);
    expect(result.message).toContain('already activated');
  });

  it('should allow activating different playbooks for the same user', async () => {
    const r1 = await activatePlaybook('user-3', 'pb-morning-briefing');
    const r2 = await activatePlaybook('user-3', 'pb-email-triage');
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('should fail to activate a non-existent playbook', async () => {
    const result = await activatePlaybook('user-4', 'pb-nonexistent');
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('should generate a personalized playbook via AI', async () => {
    const pb = await generatePersonalizedPlaybook(
      'user-5',
      'Product Manager',
      'SaaS',
      ['improve productivity', 'reduce meetings']
    );
    expect(pb).toBeDefined();
    expect(pb.name).toBe('Custom Playbook');
    expect(pb.steps.length).toBeGreaterThan(0);
  });

  it('should persist activations across separate calls (database-backed)', async () => {
    await activatePlaybook('persist-user', 'pb-meeting-prep');
    // Second activation of same playbook should fail (reads from DB)
    const result = await activatePlaybook('persist-user', 'pb-meeting-prep');
    expect(result.success).toBe(false);
    expect(result.message).toContain('already activated');
  });
});
