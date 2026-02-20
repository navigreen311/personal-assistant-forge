import {
  WakeWordService,
  MockWakeWordEngine,
  BrowserWakeWordEngine,
  DEFAULT_WAKE_WORD_CONFIG,
  ENGINE_REGISTRY,
  createEngine,
} from '@/modules/voice/services/wake-word-service';
import type { WakeWordConfig, WakeWordDetectionEvent } from '@/modules/voice/types';

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

    it('should create an engine on initialization', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      expect(service.getEngine()).not.toBeNull();
    });

    it('should dispose previous engine when re-initializing', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      const firstEngine = service.getEngine();
      expect(firstEngine).not.toBeNull();

      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, phrase: 'New Phrase' });
      const secondEngine = service.getEngine();
      expect(secondEngine).not.toBeNull();
      // Should be a new engine instance
      expect(secondEngine).not.toBe(firstEngine);
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

    it('should set status to listening', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      await service.startListening();
      expect(service.getStatus()).toBe('listening');
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

    it('should set status back to idle', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      await service.startListening();
      await service.stopListening();
      expect(service.getStatus()).toBe('idle');
    });
  });

  describe('setWakeWord', () => {
    it('should update the wake word in config', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      service.setWakeWord('Hey Assistant');
      expect(service.getConfig().phrase).toBe('Hey Assistant');
    });

    it('should trim whitespace', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      service.setWakeWord('  Hello World  ');
      expect(service.getConfig().phrase).toBe('Hello World');
    });

    it('should reject empty string', () => {
      expect(() => service.setWakeWord('')).toThrow('Wake word cannot be empty');
    });

    it('should reject whitespace-only string', () => {
      expect(() => service.setWakeWord('   ')).toThrow('Wake word cannot be empty');
    });
  });

  describe('setSensitivity', () => {
    it('should update sensitivity in config', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      service.setSensitivity(0.8);
      expect(service.getConfig().sensitivity).toBe(0.8);
    });

    it('should accept boundary value 0.0', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      service.setSensitivity(0.0);
      expect(service.getConfig().sensitivity).toBe(0.0);
    });

    it('should accept boundary value 1.0', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      service.setSensitivity(1.0);
      expect(service.getConfig().sensitivity).toBe(1.0);
    });

    it('should reject values below 0', () => {
      expect(() => service.setSensitivity(-0.1)).toThrow('Sensitivity must be between 0.0 and 1.0');
    });

    it('should reject values above 1', () => {
      expect(() => service.setSensitivity(1.1)).toThrow('Sensitivity must be between 0.0 and 1.0');
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

  describe('onWakeWordDetected with event callback', () => {
    it('should pass detection event to event-based callbacks', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, phrase: 'Hey Test' });
      const events: WakeWordDetectionEvent[] = [];
      service.onWakeWordDetected((event: WakeWordDetectionEvent) => {
        events.push(event);
      });

      service.simulateDetection();

      expect(events).toHaveLength(1);
      expect(events[0].phrase).toBe('Hey Test');
      expect(events[0].confidence).toBe(0.95);
      expect(events[0].timestamp).toBeInstanceOf(Date);
      expect(typeof events[0].engine).toBe('string');
    });
  });

  describe('removeCallback', () => {
    it('should remove a previously registered callback', () => {
      const cb = jest.fn();
      service.onWakeWordDetected(cb);
      service.simulateDetection();
      expect(cb).toHaveBeenCalledTimes(1);

      service.removeCallback(cb);
      service.simulateDetection();
      // Should still be 1 -- the second detection should not call cb
      expect(cb).toHaveBeenCalledTimes(1);
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

  describe('getStatus', () => {
    it('should return idle before initialization', () => {
      expect(service.getStatus()).toBe('idle');
    });

    it('should return idle after initialization', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      expect(service.getStatus()).toBe('idle');
    });

    it('should return listening while active', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, enabled: true });
      await service.startListening();
      expect(service.getStatus()).toBe('listening');
    });
  });

  describe('getSupportedEngines', () => {
    it('should return a non-empty array of engine info', () => {
      const engines = service.getSupportedEngines();
      expect(engines.length).toBeGreaterThan(0);
    });

    it('should include browser engine', () => {
      const engines = service.getSupportedEngines();
      const browser = engines.find((e) => e.type === 'browser');
      expect(browser).toBeDefined();
      expect(browser!.name).toBe('Web Speech API');
      expect(browser!.requiresApiKey).toBe(false);
    });

    it('should include porcupine engine', () => {
      const engines = service.getSupportedEngines();
      const porcupine = engines.find((e) => e.type === 'porcupine');
      expect(porcupine).toBeDefined();
      expect(porcupine!.requiresApiKey).toBe(true);
    });

    it('should include mock engine', () => {
      const engines = service.getSupportedEngines();
      const mock = engines.find((e) => e.type === 'mock');
      expect(mock).toBeDefined();
      expect(mock!.requiresApiKey).toBe(false);
    });

    it('should return a defensive copy', () => {
      const engines1 = service.getSupportedEngines();
      const engines2 = service.getSupportedEngines();
      expect(engines1).not.toBe(engines2);
      expect(engines1).toEqual(engines2);
    });
  });

  describe('testWakeWord', () => {
    it('should return failure when not initialized', async () => {
      const result = await service.testWakeWord();
      expect(result.success).toBe(false);
      expect(result.engineInitialized).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should delegate to engine selfTest after initialization', async () => {
      await service.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
      const result = await service.testWakeWord();
      // In Node/test environment, browser engine will report inert state
      // but should not throw
      expect(result).toBeDefined();
      expect(result.engineType).toBeDefined();
      expect(typeof result.latencyMs).toBe('number');
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

// ============================================================================
// MockWakeWordEngine -- Unit tests
// ============================================================================

describe('MockWakeWordEngine', () => {
  let engine: MockWakeWordEngine;

  beforeEach(() => {
    engine = new MockWakeWordEngine();
  });

  it('should report mock engine type', () => {
    expect(engine.engineType).toBe('mock');
  });

  it('should initialize without error', async () => {
    await engine.initialize({
      enabled: true,
      phrase: 'Hey Test',
      sensitivity: 0.5,
      provider: 'custom',
    });
    expect(engine.getStatus()).toBe('idle');
  });

  it('should transition to listening on start', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
    await engine.start();
    expect(engine.getStatus()).toBe('listening');
  });

  it('should transition to idle on stop', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
    await engine.start();
    await engine.stop();
    expect(engine.getStatus()).toBe('idle');
  });

  it('should fire detection via simulateDetection', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, phrase: 'Hey Mock' });
    const events: WakeWordDetectionEvent[] = [];
    engine.setDetectionHandler((event) => events.push(event));

    engine.simulateDetection(0.88);

    expect(events).toHaveLength(1);
    expect(events[0].phrase).toBe('Hey Mock');
    expect(events[0].confidence).toBe(0.88);
    expect(events[0].engine).toBe('mock');
  });

  it('should fire detection after scheduled frames', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
    await engine.start();
    const events: WakeWordDetectionEvent[] = [];
    engine.setDetectionHandler((event) => events.push(event));

    engine.scheduleTrigger(3);
    const frame = new Float32Array(512);

    expect(engine.processAudioFrame(frame)).toBe(false); // frame 1
    expect(engine.processAudioFrame(frame)).toBe(false); // frame 2
    expect(engine.processAudioFrame(frame)).toBe(true);  // frame 3 -- triggers
    expect(events).toHaveLength(1);

    // Further frames should not re-trigger
    expect(engine.processAudioFrame(frame)).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('should not process frames when not listening', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
    // Not started
    engine.scheduleTrigger(1);
    const frame = new Float32Array(512);
    expect(engine.processAudioFrame(frame)).toBe(false);
  });

  it('should track frame count', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
    await engine.start();
    expect(engine.getFrameCount()).toBe(0);

    const frame = new Float32Array(512);
    engine.processAudioFrame(frame);
    engine.processAudioFrame(frame);
    expect(engine.getFrameCount()).toBe(2);
  });

  it('should pass self-test', async () => {
    const result = await engine.selfTest();
    expect(result.success).toBe(true);
    expect(result.engineType).toBe('mock');
    expect(result.microphoneAvailable).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should provide engine info', () => {
    const info = engine.getInfo();
    expect(info.type).toBe('mock');
    expect(info.name).toBe('Mock Engine');
    expect(info.requiresApiKey).toBe(false);
    expect(info.supportedPlatforms).toContain('node');
  });

  it('should clean up on dispose', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
    await engine.start();
    expect(engine.getStatus()).toBe('listening');

    await engine.dispose();
    expect(engine.getStatus()).toBe('idle');
    expect(engine.getFrameCount()).toBe(0);
  });

  it('should update wake word', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG, phrase: 'Original' });
    engine.setWakeWord('Updated');

    const events: WakeWordDetectionEvent[] = [];
    engine.setDetectionHandler((event) => events.push(event));
    engine.simulateDetection();

    expect(events[0].phrase).toBe('Updated');
  });
});

// ============================================================================
// BrowserWakeWordEngine -- Unit tests (server-side / Node environment)
// ============================================================================

describe('BrowserWakeWordEngine', () => {
  let engine: BrowserWakeWordEngine;

  beforeEach(() => {
    engine = new BrowserWakeWordEngine();
  });

  it('should report browser engine type', () => {
    expect(engine.engineType).toBe('browser');
  });

  it('should initialize without error in Node (server-side inert mode)', async () => {
    // In Node.js, window is undefined, so the engine becomes inert
    await engine.initialize({
      enabled: true,
      phrase: 'Hey Forge',
      sensitivity: 0.5,
      provider: 'browser',
    });
    expect(engine.getStatus()).toBe('idle');
  });

  it('should return false for processAudioFrame (always a no-op)', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
    const frame = new Float32Array(512);
    expect(engine.processAudioFrame(frame)).toBe(false);
  });

  it('should provide engine info', () => {
    const info = engine.getInfo();
    expect(info.type).toBe('browser');
    expect(info.name).toBe('Web Speech API');
    expect(info.requiresApiKey).toBe(false);
    expect(info.supportedPlatforms).toContain('browser');
    expect(info.supportsCustomWakeWords).toBe(true);
  });

  it('should clean up on dispose', async () => {
    await engine.initialize({ ...DEFAULT_WAKE_WORD_CONFIG });
    await engine.dispose();
    expect(engine.getStatus()).toBe('idle');
  });
});

// ============================================================================
// createEngine factory -- Unit tests
// ============================================================================

describe('createEngine', () => {
  it('should create a BrowserWakeWordEngine for browser type', () => {
    const engine = createEngine('browser');
    expect(engine).toBeInstanceOf(BrowserWakeWordEngine);
  });

  it('should create a MockWakeWordEngine for mock type', () => {
    const engine = createEngine('mock');
    expect(engine).toBeInstanceOf(MockWakeWordEngine);
  });

  it('should fall back to BrowserWakeWordEngine for porcupine type', () => {
    // Porcupine is not yet integrated, should fall back gracefully
    const engine = createEngine('porcupine');
    expect(engine).toBeInstanceOf(BrowserWakeWordEngine);
  });

  it('should fall back to BrowserWakeWordEngine for custom type', () => {
    const engine = createEngine('custom');
    expect(engine).toBeInstanceOf(BrowserWakeWordEngine);
  });
});

// ============================================================================
// ENGINE_REGISTRY -- Sanity checks
// ============================================================================

describe('ENGINE_REGISTRY', () => {
  it('should contain at least 3 engines', () => {
    expect(ENGINE_REGISTRY.length).toBeGreaterThanOrEqual(3);
  });

  it('should have unique engine types', () => {
    const types = ENGINE_REGISTRY.map((e) => e.type);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBe(types.length);
  });

  it('should have non-empty descriptions', () => {
    for (const info of ENGINE_REGISTRY) {
      expect(info.description.length).toBeGreaterThan(10);
    }
  });
});
