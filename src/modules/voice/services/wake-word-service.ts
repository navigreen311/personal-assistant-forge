// ============================================================================
// Wake Word Detection Service
// Detects a configurable wake phrase (e.g., "Hey Forge") before activating
// the voice capture session.
//
// Architecture:
//   WakeWordService (orchestrator)
//     -> WakeWordEngine (pluggable interface)
//        -> BrowserWakeWordEngine  (Web Speech API -- default, zero deps)
//        -> MockWakeWordEngine     (deterministic, for tests)
//        -> [PicovoiceWakeWordEngine] (future: Porcupine WASM integration)
//
// Configuration via environment variables:
//   NEXT_PUBLIC_WAKE_WORD_PHRASE      -- default wake phrase (default: "Hey Forge")
//   NEXT_PUBLIC_WAKE_WORD_SENSITIVITY -- detection sensitivity 0-1 (default: 0.5)
//   NEXT_PUBLIC_WAKE_WORD_ENGINE      -- engine type: browser|mock (default: browser)
//   PICOVOICE_ACCESS_KEY              -- required for Porcupine engine (server-side)
// ============================================================================

import type {
  WakeWordConfig,
  WakeWordEngine,
  WakeWordEngineType,
  WakeWordEngineInfo,
  WakeWordStatus,
  WakeWordDetectionEvent,
  WakeWordCallback,
  WakeWordTestResult,
} from '@/modules/voice/types';

// Browser Speech API type declarations for environments where lib.dom types are incomplete
declare class SpeechRecognition extends EventTarget { continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number; onresult: ((event: any) => void) | null; onend: (() => void) | null; onerror: ((event: any) => void) | null; start(): void; stop(): void; abort(): void; }
declare class SpeechRecognitionEvent extends Event { readonly resultIndex: number; readonly results: SpeechRecognitionResultList; }
declare class SpeechRecognitionErrorEvent extends Event { readonly error: string; readonly message: string; }

// ---------------------------------------------------------------------------
// Environment-driven defaults
// ---------------------------------------------------------------------------

const ENV_PHRASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WAKE_WORD_PHRASE) || 'Hey Forge';
const ENV_SENSITIVITY = parseFloat(
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WAKE_WORD_SENSITIVITY) || '0.5',
);
const ENV_ENGINE =
  ((typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WAKE_WORD_ENGINE) as WakeWordEngineType) || 'browser';

const DEFAULT_WAKE_WORD_CONFIG: WakeWordConfig = {
  enabled: true,
  phrase: ENV_PHRASE,
  sensitivity: Number.isFinite(ENV_SENSITIVITY) ? Math.max(0, Math.min(1, ENV_SENSITIVITY)) : 0.5,
  provider: ENV_ENGINE === 'mock' ? 'custom' : ENV_ENGINE === 'porcupine' ? 'porcupine' : 'browser',
};

// ============================================================================
// BrowserWakeWordEngine -- Web Speech API implementation
// Uses SpeechRecognition in continuous mode to listen for a trigger phrase
// in interim/final results. Works in Chrome, Edge, Safari (partial).
// ============================================================================

class BrowserWakeWordEngine implements WakeWordEngine {
  readonly engineType: WakeWordEngineType = 'browser';

  private config: WakeWordConfig = { ...DEFAULT_WAKE_WORD_CONFIG };
  private status: WakeWordStatus = 'idle';
  private recognition: SpeechRecognition | null = null;
  private wakePhraseLower: string = DEFAULT_WAKE_WORD_CONFIG.phrase.toLowerCase();
  private sensitivity: number = DEFAULT_WAKE_WORD_CONFIG.sensitivity;
  private onDetection: ((event: WakeWordDetectionEvent) => void) | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;

  /** Allow the service to wire in a detection relay */
  setDetectionHandler(handler: (event: WakeWordDetectionEvent) => void): void {
    this.onDetection = handler;
  }

  async initialize(config: WakeWordConfig): Promise<void> {
    this.config = { ...config };
    this.wakePhraseLower = config.phrase.toLowerCase();
    this.sensitivity = config.sensitivity;
    this.status = 'idle';
    this.isDisposed = false;

    // Check for Web Speech API availability
    if (typeof window === 'undefined') {
      // Server-side: engine will not function but will not crash
      console.warn('[BrowserWakeWordEngine] Not in a browser environment; engine will be inert.');
      return;
    }

    const SpeechRecognitionCtor =
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      this.status = 'error';
      throw new Error(
        'Web Speech API (SpeechRecognition) is not supported in this browser. ' +
        'Try Chrome, Edge, or Safari.',
      );
    }

    this.recognition = new (SpeechRecognitionCtor as new () => SpeechRecognition)();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 3;

    // Wire result handler -- scans interim and final results for the wake phrase
    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.handleRecognitionResult(event);
    };

    // Auto-restart on unexpected end (network glitch, timeout)
    this.recognition.onend = () => {
      if (this.status === 'listening' && !this.isDisposed) {
        this.scheduleRestart();
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const ignorable = new Set(['no-speech', 'aborted']);
      if (!ignorable.has(event.error)) {
        console.error('[BrowserWakeWordEngine] Recognition error: ' + event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.status = 'error';
        }
      }
    };

    console.log(
      '[BrowserWakeWordEngine] Initialized -- phrase="' + config.phrase +
      '", sensitivity=' + config.sensitivity,
    );
  }

  async start(): Promise<void> {
    if (this.status === 'listening') return;
    if (!this.recognition) {
      // In server-side / Node environment, recognition is null because
      // window is undefined. The engine is inert -- just set status.
      this.status = 'listening';
      return;
    }

    try {
      this.recognition.start();
      this.status = 'listening';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'InvalidStateError') {
        this.status = 'listening';
      } else {
        this.status = 'error';
        throw err;
      }
    }
  }

  async stop(): Promise<void> {
    this.clearRestartTimer();
    if (this.recognition && this.status === 'listening') {
      try {
        this.recognition.stop();
      } catch {
        // Already stopped
      }
    }
    this.status = 'idle';
  }

  setWakeWord(phrase: string): void {
    this.wakePhraseLower = phrase.toLowerCase();
    this.config.phrase = phrase;
  }

  setSensitivity(level: number): void {
    this.sensitivity = Math.max(0, Math.min(1, level));
    this.config.sensitivity = this.sensitivity;
  }

  processAudioFrame(_frame: Float32Array): boolean {
    // The browser engine relies on the SpeechRecognition event loop, not
    // manual audio frame processing. This is a no-op for the browser engine.
    // Detection is handled asynchronously via recognition.onresult.
    return false;
  }

  async selfTest(): Promise<WakeWordTestResult> {
    const errors: string[] = [];
    let microphoneAvailable = false;
    const engineInitialized = this.recognition !== null;
    const detectionWorking = engineInitialized && this.status !== 'error';

    // Test microphone access
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphoneAvailable = true;
        for (const track of stream.getTracks()) {
          track.stop();
        }
      } catch (err) {
        errors.push('Microphone access denied: ' + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      errors.push('navigator.mediaDevices.getUserMedia is not available');
    }

    if (!engineInitialized) {
      errors.push('SpeechRecognition engine is not initialized');
    }

    return {
      success: microphoneAvailable && engineInitialized && detectionWorking && errors.length === 0,
      engineType: this.engineType,
      microphoneAvailable,
      engineInitialized,
      detectionWorking,
      errors,
    };
  }

  async dispose(): Promise<void> {
    this.isDisposed = true;
    this.clearRestartTimer();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Already stopped
      }
      this.recognition.onresult = null;
      this.recognition.onend = null;
      this.recognition.onerror = null;
      this.recognition = null;
    }
    this.status = 'idle';
    this.onDetection = null;
  }

  getStatus(): WakeWordStatus {
    return this.status;
  }

  getInfo(): WakeWordEngineInfo {
    return {
      type: 'browser',
      name: 'Web Speech API',
      description:
        'Uses the browser built-in SpeechRecognition API to continuously ' +
        'listen for the wake phrase in interim transcription results. ' +
        'Zero dependencies. Works in Chrome, Edge, and Safari (partial).',
      requiresApiKey: false,
      supportedPlatforms: ['browser'],
      supportsCustomWakeWords: true,
    };
  }

  // -- Private helpers ------------------------------------------------------

  private handleRecognitionResult(event: SpeechRecognitionEvent): void {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      for (let alt = 0; alt < result.length; alt++) {
        const transcript = result[alt].transcript.toLowerCase().trim();
        const nativeConfidence = result[alt].confidence;

        if (this.containsWakePhrase(transcript)) {
          // Apply sensitivity as a confidence threshold:
          // sensitivity=0 accepts everything, sensitivity=1 requires high confidence
          const threshold = this.sensitivity * 0.5;
          const effectiveConfidence = result.isFinal
            ? Math.max(nativeConfidence, 0.8)
            : nativeConfidence;

          if (effectiveConfidence >= threshold) {
            this.status = 'detected';
            const detectionEvent: WakeWordDetectionEvent = {
              phrase: this.config.phrase,
              confidence: effectiveConfidence,
              timestamp: new Date(),
              engine: 'browser',
            };
            this.onDetection?.(detectionEvent);
            // Brief pause before resuming to avoid re-detecting same utterance
            this.pauseAndResume();
            return;
          }
        }
      }
    }
  }

  /**
   * Check if the transcript contains the wake phrase.
   * Uses a fuzzy matching approach: the wake phrase words must appear
   * consecutively in the transcript.
   */
  private containsWakePhrase(transcript: string): boolean {
    // Direct substring match
    if (transcript.includes(this.wakePhraseLower)) {
      return true;
    }

    // Fuzzy: split both into words and check for consecutive subsequence
    const phraseWords = this.wakePhraseLower.split(/\s+/);
    const transcriptWords = transcript.split(/\s+/);

    if (phraseWords.length > transcriptWords.length) return false;

    for (let start = 0; start <= transcriptWords.length - phraseWords.length; start++) {
      let match = true;
      for (let j = 0; j < phraseWords.length; j++) {
        // Allow partial match based on sensitivity -- lower sensitivity = more lenient
        const minMatchRatio = 0.5 + this.sensitivity * 0.4; // 0.5 to 0.9
        if (!this.wordSimilarity(transcriptWords[start + j], phraseWords[j], minMatchRatio)) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }

    return false;
  }

  /**
   * Simple word similarity check. Returns true if the words are similar
   * enough based on shared prefix length.
   */
  private wordSimilarity(word: string, target: string, minRatio: number): boolean {
    if (word === target) return true;

    const minLen = Math.min(word.length, target.length);
    let shared = 0;
    for (let i = 0; i < minLen; i++) {
      if (word[i] === target[i]) shared++;
      else break;
    }

    return shared / target.length >= minRatio;
  }

  private pauseAndResume(): void {
    if (!this.recognition || this.isDisposed) return;
    try {
      this.recognition.stop();
    } catch {
      // Ignore
    }
    this.restartTimer = setTimeout(() => {
      if (!this.isDisposed && this.config.enabled) {
        this.status = 'listening';
        try {
          this.recognition?.start();
        } catch {
          // onend handler will pick it up
        }
      }
    }, 1500);
  }

  private scheduleRestart(): void {
    this.clearRestartTimer();
    this.restartTimer = setTimeout(() => {
      if (!this.isDisposed && this.status === 'listening') {
        try {
          this.recognition?.start();
        } catch {
          // Will retry on next onend
        }
      }
    }, 300);
  }

  private clearRestartTimer(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
}

// ============================================================================
// MockWakeWordEngine -- Deterministic engine for testing
// Allows programmatic trigger of detections without audio hardware.
// ============================================================================

class MockWakeWordEngine implements WakeWordEngine {
  readonly engineType: WakeWordEngineType = 'mock';

  private config: WakeWordConfig = { ...DEFAULT_WAKE_WORD_CONFIG };
  private status: WakeWordStatus = 'idle';
  private wakePhraseLower: string = DEFAULT_WAKE_WORD_CONFIG.phrase.toLowerCase();
  private sensitivity: number = DEFAULT_WAKE_WORD_CONFIG.sensitivity;
  private onDetection: ((event: WakeWordDetectionEvent) => void) | null = null;
  private frameCount = 0;
  private triggerAtFrame: number | null = null;

  /** Allow the service to wire in a detection relay */
  setDetectionHandler(handler: (event: WakeWordDetectionEvent) => void): void {
    this.onDetection = handler;
  }

  async initialize(config: WakeWordConfig): Promise<void> {
    this.config = { ...config };
    this.wakePhraseLower = config.phrase.toLowerCase();
    this.sensitivity = config.sensitivity;
    this.status = 'idle';
    this.frameCount = 0;
    this.triggerAtFrame = null;
  }

  async start(): Promise<void> {
    this.status = 'listening';
    this.frameCount = 0;
  }

  async stop(): Promise<void> {
    this.status = 'idle';
    this.frameCount = 0;
    this.triggerAtFrame = null;
  }

  setWakeWord(phrase: string): void {
    this.wakePhraseLower = phrase.toLowerCase();
    this.config.phrase = phrase;
  }

  setSensitivity(level: number): void {
    this.sensitivity = Math.max(0, Math.min(1, level));
    this.config.sensitivity = this.sensitivity;
  }

  /**
   * Process a mock audio frame. If scheduleTrigger() was called, the engine
   * will fire a detection event after the specified number of frames.
   */
  processAudioFrame(_frame: Float32Array): boolean {
    if (this.status !== 'listening') return false;

    this.frameCount++;

    if (this.triggerAtFrame !== null && this.frameCount >= this.triggerAtFrame) {
      this.triggerAtFrame = null;
      this.fireDetection();
      return true;
    }

    return false;
  }

  async selfTest(): Promise<WakeWordTestResult> {
    return {
      success: true,
      engineType: 'mock',
      microphoneAvailable: true,
      engineInitialized: true,
      detectionWorking: true,
      latencyMs: 0,
      errors: [],
    };
  }

  async dispose(): Promise<void> {
    this.status = 'idle';
    this.onDetection = null;
    this.frameCount = 0;
    this.triggerAtFrame = null;
  }

  getStatus(): WakeWordStatus {
    return this.status;
  }

  getInfo(): WakeWordEngineInfo {
    return {
      type: 'mock',
      name: 'Mock Engine',
      description:
        'Deterministic testing engine. Use scheduleTrigger(n) to fire a ' +
        'detection after n processAudioFrame() calls, or simulateDetection() ' +
        'to fire immediately.',
      requiresApiKey: false,
      supportedPlatforms: ['browser', 'node'],
      supportsCustomWakeWords: true,
    };
  }

  // -- Test helpers ---------------------------------------------------------

  /** Schedule a detection event after frameCount processAudioFrame() calls */
  scheduleTrigger(afterFrames: number): void {
    this.triggerAtFrame = this.frameCount + afterFrames;
  }

  /** Fire a detection event immediately */
  simulateDetection(confidence?: number): void {
    this.fireDetection(confidence);
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  // -- Private helpers ------------------------------------------------------

  private fireDetection(confidence?: number): void {
    this.status = 'detected';
    const event: WakeWordDetectionEvent = {
      phrase: this.config.phrase,
      confidence: confidence ?? 0.95,
      timestamp: new Date(),
      engine: 'mock',
    };
    this.onDetection?.(event);

    // Auto-resume listening after mock detection
    setTimeout(() => {
      if (this.status === 'detected') {
        this.status = 'listening';
      }
    }, 100);
  }
}

// ============================================================================
// Engine Registry -- available engines and factory
// ============================================================================

const ENGINE_REGISTRY: WakeWordEngineInfo[] = [
  {
    type: 'browser',
    name: 'Web Speech API',
    description:
      'Browser-native speech recognition. Zero dependencies, works offline ' +
      'in some browsers. Best for quick setup and development.',
    requiresApiKey: false,
    supportedPlatforms: ['browser'],
    supportsCustomWakeWords: true,
  },
  {
    type: 'porcupine',
    name: 'Picovoice Porcupine',
    description:
      'High-accuracy on-device wake word engine using WASM. Supports custom ' +
      'wake words trained via Picovoice Console. Requires access key.',
    requiresApiKey: true,
    supportedPlatforms: ['browser', 'node', 'electron'],
    supportsCustomWakeWords: true,
  },
  {
    type: 'mock',
    name: 'Mock Engine',
    description:
      'Deterministic engine for automated testing. Supports programmatic ' +
      'detection triggers.',
    requiresApiKey: false,
    supportedPlatforms: ['browser', 'node'],
    supportsCustomWakeWords: true,
  },
];

function createEngine(type: WakeWordEngineType): BrowserWakeWordEngine | MockWakeWordEngine {
  switch (type) {
    case 'browser':
      return new BrowserWakeWordEngine();
    case 'mock':
      return new MockWakeWordEngine();
    case 'porcupine':
      // Picovoice integration point -- would import and instantiate the
      // Porcupine WASM engine here:
      //
      //   import { PorcupineWeb } from '@picovoice/porcupine-web';
      //   return new PicovoiceWakeWordEngine(process.env.PICOVOICE_ACCESS_KEY);
      //
      // For now, fall back to browser engine with a warning.
      console.warn(
        '[WakeWordService] Porcupine engine not yet integrated. ' +
        'Falling back to browser Web Speech API engine.',
      );
      return new BrowserWakeWordEngine();
    case 'custom':
      // Custom ML model integration point -- would load a TensorFlow.js or
      // ONNX model in a Web Worker:
      //
      //   return new CustomMLWakeWordEngine(modelUrl);
      //
      console.warn(
        '[WakeWordService] Custom engine not yet integrated. ' +
        'Falling back to browser Web Speech API engine.',
      );
      return new BrowserWakeWordEngine();
    default: {
      const _exhaustive: never = type;
      throw new Error('Unknown wake word engine type: ' + _exhaustive);
    }
  }
}

// ============================================================================
// WakeWordService -- Orchestrator
// Manages lifecycle, config, callbacks, and delegates to the active engine.
// ============================================================================

class WakeWordService {
  private config: WakeWordConfig = { ...DEFAULT_WAKE_WORD_CONFIG };
  private isListening = false;
  private status: WakeWordStatus = 'idle';
  private callbacks: Array<WakeWordCallback> = [];
  private legacyCallbacks: Array<() => void> = [];
  private configHistory: Array<{ config: WakeWordConfig; setAt: Date }> = [];
  private engine: (BrowserWakeWordEngine | MockWakeWordEngine) | null = null;

  // -- Initialization -------------------------------------------------------

  async initialize(config: WakeWordConfig): Promise<void> {
    if (config.sensitivity < 0 || config.sensitivity > 1) {
      throw new Error('Sensitivity must be between 0 and 1');
    }

    // Dispose the old engine if switching providers
    if (this.engine) {
      await this.engine.dispose();
      this.engine = null;
    }

    this.config = { ...config };
    this.status = 'idle';
    this.isListening = false;

    // Determine engine type from provider
    const engineType = this.providerToEngineType(config.provider);
    this.engine = createEngine(engineType);

    // Wire the engine detection events to our callback relay
    this.engine.setDetectionHandler((event) => {
      this.handleDetection(event);
    });

    await this.engine.initialize(config);

    console.log(
      '[WakeWord] Initialized with phrase "' + config.phrase + '" ' +
      '(provider: ' + config.provider + ', engine: ' + this.engine.engineType +
      ', sensitivity: ' + config.sensitivity + ')',
    );
  }

  // -- Listening lifecycle --------------------------------------------------

  async startListening(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[WakeWord] Wake word detection is disabled');
      return;
    }

    if (this.isListening) {
      console.log('[WakeWord] Already listening');
      return;
    }

    if (!this.engine) {
      throw new Error('WakeWordService not initialized. Call initialize() first.');
    }

    await this.engine.start();
    this.isListening = true;
    this.status = 'listening';

    console.log(
      '[WakeWord] Listening for wake phrase "' + this.config.phrase + '"...',
    );
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    if (this.engine) {
      await this.engine.stop();
    }

    this.isListening = false;
    this.status = 'idle';

    console.log('[WakeWord] Stopped listening');
  }

  // -- Wake word & sensitivity ----------------------------------------------

  setWakeWord(word: string): void {
    if (!word || word.trim().length === 0) {
      throw new Error('Wake word cannot be empty');
    }
    this.config.phrase = word.trim();
    this.engine?.setWakeWord(this.config.phrase);
  }

  setSensitivity(level: number): void {
    if (level < 0 || level > 1) {
      throw new Error('Sensitivity must be between 0.0 and 1.0');
    }
    this.config.sensitivity = level;
    this.engine?.setSensitivity(level);
  }

  // -- Callbacks ------------------------------------------------------------

  /** Register a callback for wake word detection with full event data */
  onWakeWordDetected(callback: WakeWordCallback | (() => void)): void {
    // Support both legacy no-arg callbacks and new event-based callbacks
    if (callback.length === 0) {
      this.legacyCallbacks.push(callback as () => void);
    } else {
      this.callbacks.push(callback as WakeWordCallback);
    }
  }

  removeCallback(callback: WakeWordCallback | (() => void)): void {
    this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    this.legacyCallbacks = this.legacyCallbacks.filter((cb) => cb !== callback);
  }

  // -- Status & info --------------------------------------------------------

  getStatus(): WakeWordStatus {
    if (this.engine) {
      return this.engine.getStatus();
    }
    return this.status;
  }

  getSupportedEngines(): WakeWordEngineInfo[] {
    return [...ENGINE_REGISTRY];
  }

  // -- Self-test ------------------------------------------------------------

  async testWakeWord(): Promise<WakeWordTestResult> {
    if (!this.engine) {
      return {
        success: false,
        engineType: 'browser',
        microphoneAvailable: false,
        engineInitialized: false,
        detectionWorking: false,
        errors: ['WakeWordService not initialized. Call initialize() first.'],
      };
    }

    const startTime = Date.now();
    const result = await this.engine.selfTest();
    result.latencyMs = Date.now() - startTime;

    console.log(
      '[WakeWord] Self-test ' + (result.success ? 'PASSED' : 'FAILED') +
      ' (engine: ' + result.engineType + ', mic: ' + result.microphoneAvailable +
      ', latency: ' + result.latencyMs + 'ms)',
    );

    return result;
  }

  // -- Config management (preserves existing API) ---------------------------

  async updateConfig(updates: Partial<WakeWordConfig>): Promise<WakeWordConfig> {
    const wasListening = this.isListening;
    if (wasListening) await this.stopListening();

    const providerChanged = updates.provider && updates.provider !== this.config.provider;

    this.config = { ...this.config, ...updates };
    this.configHistory.push({ config: { ...this.config }, setAt: new Date() });

    // If the provider changed, re-initialize with a new engine
    if (providerChanged) {
      await this.initialize(this.config);
    } else {
      // Apply granular updates to the existing engine
      if (updates.phrase) {
        this.engine?.setWakeWord(this.config.phrase);
      }
      if (updates.sensitivity !== undefined) {
        this.engine?.setSensitivity(this.config.sensitivity);
      }
    }

    if (wasListening) await this.startListening();
    return this.config;
  }

  getConfig(): WakeWordConfig {
    return { ...this.config };
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  getConfigHistory(): Array<{ config: WakeWordConfig; setAt: Date }> {
    return [...this.configHistory];
  }

  // -- Audio frame processing (pass-through to engine) ----------------------

  /**
   * Process an audio frame for wake word detection.
   * For browser engine this is a no-op (detection is event-driven).
   * For Porcupine/custom engines this feeds the frame to the model.
   */
  processAudioFrame(frame: Float32Array): boolean {
    if (!this.isListening || !this.config.enabled) return false;
    if (!this.engine) return false;
    return this.engine.processAudioFrame(frame);
  }

  // -- Testing helpers ------------------------------------------------------

  /** For testing: manually trigger detection */
  simulateDetection(): void {
    const event: WakeWordDetectionEvent = {
      phrase: this.config.phrase,
      confidence: 0.95,
      timestamp: new Date(),
      engine: this.engine?.engineType ?? 'mock',
    };
    this.handleDetection(event);
  }

  /** Get the underlying engine (for advanced testing scenarios) */
  getEngine(): WakeWordEngine | null {
    return this.engine;
  }

  // -- Private helpers ------------------------------------------------------

  private handleDetection(event: WakeWordDetectionEvent): void {
    this.status = 'detected';

    console.log(
      '[WakeWord] Wake word "' + event.phrase + '" detected! ' +
      '(confidence: ' + (event.confidence * 100).toFixed(1) + '%, engine: ' + event.engine + ')',
    );

    // Notify all event-based callbacks
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (err) {
        console.error('[WakeWord] Callback error:', err);
      }
    }

    // Notify all legacy no-arg callbacks
    for (const callback of this.legacyCallbacks) {
      try {
        callback();
      } catch (err) {
        console.error('[WakeWord] Legacy callback error:', err);
      }
    }
  }

  private providerToEngineType(provider: WakeWordConfig['provider']): WakeWordEngineType {
    switch (provider) {
      case 'browser':
        return 'browser';
      case 'porcupine':
        return 'porcupine';
      case 'custom':
        // Check env for engine override (allows mock engine via config)
        return ENV_ENGINE === 'mock' ? 'mock' : 'browser';
      default:
        return 'browser';
    }
  }
}

export const wakeWordService = new WakeWordService();
export {
  WakeWordService,
  BrowserWakeWordEngine,
  MockWakeWordEngine,
  DEFAULT_WAKE_WORD_CONFIG,
  ENGINE_REGISTRY,
  createEngine,
};
