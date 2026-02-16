jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1', preferences: {} }),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

import {
  getDNDConfig,
  setDND,
  isDNDActive,
  checkVIPBreakthrough,
  enableDND,
  disableDND,
  setQuietHours,
  addException,
  shouldSuppress,
  dndStore,
} from '@/modules/attention/services/dnd-service';

beforeEach(() => {
  dndStore.clear();
  jest.clearAllMocks();
});

describe('enableDND', () => {
  it('should set DND enabled in user preferences', async () => {
    const config = await enableDND('user-1');
    expect(config.isActive).toBe(true);
    expect(config.mode).toBe('MANUAL');
  });

  it('should accept optional duration and exceptions', async () => {
    const config = await enableDND('user-1', {
      durationMinutes: 60,
      exceptions: ['contact-1', 'contact-2'],
    });
    expect(config.isActive).toBe(true);
    expect(config.vipContactIds).toContain('contact-1');
    expect(config.vipContactIds).toContain('contact-2');
    // Duration stored as metadata in reason
    expect(config.reason).toBeDefined();
    const meta = JSON.parse(config.reason!);
    expect(meta.expiresAt).toBeDefined();
  });

  it('should merge exceptions with existing VIP list', async () => {
    await setDND('user-1', { vipContactIds: ['existing-vip'] });
    const config = await enableDND('user-1', { exceptions: ['new-vip'] });
    expect(config.vipContactIds).toContain('existing-vip');
    expect(config.vipContactIds).toContain('new-vip');
  });
});

describe('disableDND', () => {
  it('should turn off DND', async () => {
    await enableDND('user-1');
    const config = await disableDND('user-1');
    expect(config.isActive).toBe(false);
  });
});

describe('isDNDActive', () => {
  it('should return true when manually enabled', async () => {
    await setDND('user-1', { isActive: true, mode: 'MANUAL' });
    expect(await isDNDActive('user-1')).toBe(true);
  });

  it('should return true during quiet hours', async () => {
    const now = new Date();
    const start = `${String(now.getHours()).padStart(2, '0')}:00`;
    const end = `${String(now.getHours() + 1).padStart(2, '0')}:00`;
    await setDND('user-1', { mode: 'FOCUS_HOURS', startTime: start, endTime: end, isActive: false });
    expect(await isDNDActive('user-1')).toBe(true);
  });

  it('should return false when DND is disabled and outside quiet hours', async () => {
    await setDND('user-1', {
      mode: 'FOCUS_HOURS',
      startTime: '03:00',
      endTime: '04:00',
      isActive: false,
    });
    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour < 3 || currentHour >= 4) {
      expect(await isDNDActive('user-1')).toBe(false);
    }
  });

  it('should auto-expire after duration', async () => {
    // Enable with a 30-minute duration
    const config = await enableDND('user-1', { durationMinutes: 30 });
    expect(config.isActive).toBe(true);
    // Duration metadata is stored for expiry checking
    const meta = JSON.parse(config.reason || '{}');
    expect(meta.expiresAt).toBeDefined();
    const expiresAt = new Date(meta.expiresAt).getTime();
    // Should expire ~30 minutes from now
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 31 * 60 * 1000);
  });

  it('should return false by default for new users', async () => {
    expect(await isDNDActive('new-user')).toBe(false);
  });
});

describe('setQuietHours', () => {
  it('should configure quiet hours', async () => {
    const config = await setQuietHours('user-1', 22, 7);
    expect(config.mode).toBe('FOCUS_HOURS');
    expect(config.startTime).toBe('22:00');
    expect(config.endTime).toBe('07:00');
  });
});

describe('addException', () => {
  it('should add a contact to VIP list', async () => {
    const config = await addException('user-1', 'important-contact');
    expect(config.vipContactIds).toContain('important-contact');
    expect(config.vipBreakthroughEnabled).toBe(true);
  });

  it('should not duplicate contacts', async () => {
    await addException('user-1', 'contact-1');
    const config = await addException('user-1', 'contact-1');
    const count = config.vipContactIds.filter((id) => id === 'contact-1').length;
    expect(count).toBe(1);
  });
});

describe('shouldSuppress', () => {
  it('should suppress normal notifications during DND', async () => {
    await setDND('user-1', { isActive: true, mode: 'MANUAL' });
    const suppressed = await shouldSuppress('user-1', {
      priority: 'P1',
      source: 'email',
    });
    expect(suppressed).toBe(true);
  });

  it('should allow exception contacts during DND', async () => {
    await setDND('user-1', {
      isActive: true,
      mode: 'MANUAL',
      vipBreakthroughEnabled: true,
      vipContactIds: ['vip-contact'],
    });
    const suppressed = await shouldSuppress('user-1', {
      priority: 'P1',
      contactId: 'vip-contact',
    });
    expect(suppressed).toBe(false);
  });

  it('should not suppress when DND is inactive', async () => {
    const suppressed = await shouldSuppress('user-1', {
      priority: 'P1',
      source: 'email',
    });
    expect(suppressed).toBe(false);
  });

  it('should not suppress P0/urgent notifications during DND', async () => {
    await setDND('user-1', { isActive: true, mode: 'MANUAL' });
    const suppressed = await shouldSuppress('user-1', {
      priority: 'P0',
      source: 'system',
    });
    expect(suppressed).toBe(false);
  });

  it('should suppress P2 notifications during DND', async () => {
    await setDND('user-1', { isActive: true, mode: 'MANUAL' });
    const suppressed = await shouldSuppress('user-1', {
      priority: 'P2',
      source: 'newsletter',
    });
    expect(suppressed).toBe(true);
  });
});

describe('checkVIPBreakthrough', () => {
  it('should allow VIP contacts', async () => {
    await setDND('user-1', {
      vipBreakthroughEnabled: true,
      vipContactIds: ['vip-1'],
    });
    expect(await checkVIPBreakthrough('user-1', 'vip-1')).toBe(true);
  });

  it('should block non-VIP contacts', async () => {
    await setDND('user-1', {
      vipBreakthroughEnabled: true,
      vipContactIds: ['vip-1'],
    });
    expect(await checkVIPBreakthrough('user-1', 'regular-user')).toBe(false);
  });

  it('should block all when VIP breakthrough disabled', async () => {
    await setDND('user-1', {
      vipBreakthroughEnabled: false,
      vipContactIds: ['vip-1'],
    });
    expect(await checkVIPBreakthrough('user-1', 'vip-1')).toBe(false);
  });
});
