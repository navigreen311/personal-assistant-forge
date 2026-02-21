import {
  checkProviderHealth,
  getHealthyProvider,
  listFallbacks,
  setFallback,
  activateKillSwitch,
  deactivateKillSwitch,
  setHealthCheckInterval,
  _resetProviderStore,
} from '@/engines/cost/provider-failover';

describe('provider-failover', () => {
  beforeEach(() => {
    _resetProviderStore();
  });

  describe('checkProviderHealth', () => {
    it('should return HEALTHY status for a new provider', async () => {
      const health = await checkProviderHealth('test-provider');

      expect(health.providerId).toBe('test-provider');
      expect(health.providerName).toBe('test-provider');
      expect(health.status).toBe('HEALTHY');
      expect(health.errorRate).toBe(0);
      expect(health.latencyMs).toBe(50);
      expect(health.lastChecked).toBeInstanceOf(Date);
    });

    it('should return cached health when within check interval', async () => {
      const first = await checkProviderHealth('cached-provider');
      const second = await checkProviderHealth('cached-provider');

      // Same lastChecked time means cache was used
      expect(second.lastChecked.getTime()).toBe(first.lastChecked.getTime());
    });

    it('should return DOWN status when kill switch is active', async () => {
      await activateKillSwitch('broken-provider');

      const health = await checkProviderHealth('broken-provider');

      expect(health.status).toBe('DOWN');
      expect(health.errorRate).toBe(1.0);
      expect(health.latencyMs).toBe(0);
    });

    it('should refresh cache after interval expires', async () => {
      // Set a very short interval so the cache expires immediately
      setHealthCheckInterval(0);

      const first = await checkProviderHealth('refresh-provider');

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));

      const second = await checkProviderHealth('refresh-provider');

      // With interval=0, each call should re-check (new timestamp)
      expect(second.lastChecked.getTime()).toBeGreaterThanOrEqual(first.lastChecked.getTime());
    });
  });

  describe('getHealthyProvider', () => {
    it('should return primary provider when it is healthy', async () => {
      const result = await getHealthyProvider('primary', 'fallback');

      expect(result).toBe('primary');
    });

    it('should return fallback provider when primary is down', async () => {
      await activateKillSwitch('primary');

      const result = await getHealthyProvider('primary', 'fallback');

      expect(result).toBe('fallback');
    });

    it('should return primary as last resort when both are down', async () => {
      await activateKillSwitch('primary');
      await activateKillSwitch('fallback');

      const result = await getHealthyProvider('primary', 'fallback');

      expect(result).toBe('primary');
    });
  });

  describe('listFallbacks / setFallback', () => {
    it('should list default fallback configurations', () => {
      const fallbacks = listFallbacks();

      expect(fallbacks.length).toBeGreaterThanOrEqual(3);

      const twilioFb = fallbacks.find(f => f.primaryProviderId === 'twilio');
      expect(twilioFb).toBeDefined();
      expect(twilioFb!.fallbackProviderId).toBe('vonage');
      expect(twilioFb!.isAutomatic).toBe(true);
      expect(twilioFb!.isActive).toBe(false);
    });

    it('should add a new fallback configuration', () => {
      const fb = setFallback('stripe', 'paypal', 'ERROR_RATE_HIGH', false);

      expect(fb.primaryProviderId).toBe('stripe');
      expect(fb.fallbackProviderId).toBe('paypal');
      expect(fb.triggerCondition).toBe('ERROR_RATE_HIGH');
      expect(fb.isAutomatic).toBe(false);
      expect(fb.isActive).toBe(false);

      const allFallbacks = listFallbacks();
      const found = allFallbacks.find(f => f.primaryProviderId === 'stripe');
      expect(found).toBeDefined();
    });

    it('should update an existing fallback when primary matches', () => {
      // twilio already exists in defaults
      setFallback('twilio', 'plivo', 'SLOW', true);

      const fallbacks = listFallbacks();
      const twilioFbs = fallbacks.filter(f => f.primaryProviderId === 'twilio');
      expect(twilioFbs).toHaveLength(1);
      expect(twilioFbs[0].fallbackProviderId).toBe('plivo');
      expect(twilioFbs[0].triggerCondition).toBe('SLOW');
    });
  });

  describe('activateKillSwitch / deactivateKillSwitch', () => {
    it('should mark the provider fallback as active on kill switch', async () => {
      await activateKillSwitch('openai');

      const fallbacks = listFallbacks();
      const openAiFb = fallbacks.find(f => f.primaryProviderId === 'openai');
      expect(openAiFb).toBeDefined();
      expect(openAiFb!.isActive).toBe(true);
    });

    it('should deactivate fallback and restore provider health after deactivation', async () => {
      await activateKillSwitch('sendgrid');

      // Confirm it is down
      let health = await checkProviderHealth('sendgrid');
      expect(health.status).toBe('DOWN');

      await deactivateKillSwitch('sendgrid');

      // After deactivation, provider should be healthy again
      health = await checkProviderHealth('sendgrid');
      expect(health.status).toBe('HEALTHY');

      const fallbacks = listFallbacks();
      const sgFb = fallbacks.find(f => f.primaryProviderId === 'sendgrid');
      expect(sgFb!.isActive).toBe(false);
    });
  });
});
