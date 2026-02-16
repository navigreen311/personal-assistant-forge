import { WakeWordService, DEFAULT_WAKE_WORD_CONFIG } from '@/modules/voice/services/wake-word-service';
import type { WakeWordConfig } from '@/modules/voice/types';

describe('WakeWordService', () => {
  let service: WakeWordService;

  beforeEach(() => {
    service = new WakeWordService();
  });

  describe('initialize', () => {
    it('should set config from provided values', async () => {
      const config: WakeWordConfig = {
        enabled: true,
        phrase: 'Hey Assistant',
        sensitivity: 0.7,
        provider: 'porcupine',
      };

      await service.initialize(config);
      const result = service.getConfig();
      expect(result.phrase).toBe('Hey Assistant');
      expect(result.sensitivity).toBe(0.7);
      expect(result.provider).toBe('porcupine');
    });

    it('should reject sensitivity below 0', async () => {
      const config: WakeWordConfig = {
        enabled: true,
        phrase: 'Hey Forge',
        sensitivity: -0.1,
        provider: 'browser',
      };

      await expect(service.initialize(config)).rejects.toThrow(
        'Sensitivity must be between 0 and 1'
      );
    });

    it('should reject sensitivity above 1', async () => {
      const config: WakeWordConfig = {
        enabled: true,
        phrase: 'Hey Forge',
        sensitivity: 1.5,
        provider: 'browser',
      };

      await expect(service.initialize(config)).rejects.toThrow(
        'Sensitivity must be between 0 and 1'
      );
    });
  });

  describe('startListening', () => {
    it('should set isListening to true when enabled', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      await service.startListening();
      expect(service.getIsListening()).toBe(true);
    });

    it('should not start when disabled', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: false });
      await service.startListening();
      expect(service.getIsListening()).toBe(false);
    });

    it('should not start when already listening', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      await service.startListening();
      expect(service.getIsListening()).toBe(true);
      // Calling again should be idempotent
      await service.startListening();
      expect(service.getIsListening()).toBe(true);
    });
  });

  describe('stopListening', () => {
    it('should set isListening to false', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      await service.startListening();
      expect(service.getIsListening()).toBe(true);
      await service.stopListening();
      expect(service.getIsListening()).toBe(false);
    });

    it('should be idempotent', async () => {
      await service.stopListening();
      expect(service.getIsListening()).toBe(false);
      await service.stopListening();
      expect(service.getIsListening()).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update config and restart listening if was listening', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      await service.startListening();
      expect(service.getIsListening()).toBe(true);

      const updated = await service.updateConfig({ phrase: 'Hello Forge' });
      expect(updated.phrase).toBe('Hello Forge');
      // Should still be listening after update
      expect(service.getIsListening()).toBe(true);
    });

    it('should update config without restarting if was not listening', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      expect(service.getIsListening()).toBe(false);

      const updated = await service.updateConfig({ sensitivity: 0.8 });
      expect(updated.sensitivity).toBe(0.8);
      expect(service.getIsListening()).toBe(false);
    });

    it('should record config change in history', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      expect(service.getConfigHistory()).toHaveLength(0);

      await service.updateConfig({ phrase: 'Yo Forge' });
      expect(service.getConfigHistory()).toHaveLength(1);
      expect(service.getConfigHistory()[0].config.phrase).toBe('Yo Forge');

      await service.updateConfig({ sensitivity: 0.9 });
      expect(service.getConfigHistory()).toHaveLength(2);
    });
  });

  describe('simulateDetection', () => {
    it('should call all registered callbacks', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      service.onWakeWordDetected(cb1);
      service.onWakeWordDetected(cb2);

      service.simulateDetection();

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('should handle no registered callbacks gracefully', () => {
      expect(() => service.simulateDetection()).not.toThrow();
    });
  });

  describe('processAudioFrame', () => {
    it('should return false when not listening', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      const frame = new Float32Array(512);
      expect(service.processAudioFrame(frame)).toBe(false);
    });

    it('should return false when disabled', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: false });
      const frame = new Float32Array(512);
      expect(service.processAudioFrame(frame)).toBe(false);
    });
  });

  describe('getConfigHistory', () => {
    it('should return empty array initially', () => {
      expect(service.getConfigHistory()).toHaveLength(0);
    });

    it('should record config changes', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      await service.updateConfig({ phrase: 'Test1' });
      await service.updateConfig({ phrase: 'Test2' });
      const history = service.getConfigHistory();
      expect(history).toHaveLength(2);
      expect(history[0].config.phrase).toBe('Test1');
      expect(history[1].config.phrase).toBe('Test2');
      expect(history[0].setAt).toBeInstanceOf(Date);
    });
  });
});
