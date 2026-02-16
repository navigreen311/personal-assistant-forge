// ============================================================================
// Wake Word Detection Service (Placeholder)
// Detects a configurable wake phrase (e.g., "Hey Forge") before activating
// the voice capture session.
//
// Production integration points:
// - Picovoice Porcupine: https://picovoice.ai/products/porcupine/
//   Lightweight on-device wake word engine. Supports custom wake words.
//   Integration: porcupine.create({ keyword: 'hey_forge' })
//
// - Custom ML model: A TensorFlow.js or ONNX model trained on wake word audio.
//   Would run in a Web Worker to avoid blocking the main thread.
//
// - Browser Web Speech API: Use continuous recognition and listen for the
//   wake phrase in interim results. Less reliable but zero dependencies.
// ============================================================================

import type { WakeWordConfig } from '@/modules/voice/types';

const DEFAULT_WAKE_WORD_CONFIG: WakeWordConfig = {
  enabled: true,
  phrase: 'Hey Forge',
  sensitivity: 0.5,
  provider: 'browser',
};

class WakeWordService {
  private config: WakeWordConfig = DEFAULT_WAKE_WORD_CONFIG;
  private isListening = false;
  private callbacks: Array<() => void> = [];
  private configHistory: Array<{ config: WakeWordConfig; setAt: Date }> = [];

  async initialize(config: WakeWordConfig): Promise<void> {
    if (config.sensitivity < 0 || config.sensitivity > 1) {
      throw new Error('Sensitivity must be between 0 and 1');
    }

    this.config = config;

    // Placeholder: In production, this would:
    // - For 'porcupine': Load the Porcupine WASM module and custom keyword model
    //   const porcupine = await PorcupineWeb.create(accessKey, [keyword]);
    // - For 'custom': Load the custom ML model into a Web Worker
    //   const worker = new Worker('wake-word-worker.js');
    // - For 'browser': Set up continuous SpeechRecognition
    //   const recognition = new webkitSpeechRecognition();

    console.log(
      `[WakeWord] Initialized with phrase "${config.phrase}" ` +
      `(provider: ${config.provider}, sensitivity: ${config.sensitivity})`,
    );
  }

  async startListening(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[WakeWord] Wake word detection is disabled');
      return;
    }

    if (this.isListening) {
      console.log('[WakeWord] Already listening');
      return;
    }

    this.isListening = true;

    // Placeholder: Wake word detection would activate here.
    // In production, this would start the audio pipeline:
    // 1. Request microphone access via navigator.mediaDevices.getUserMedia()
    // 2. Create an AudioContext and connect to the wake word processor
    // 3. For Porcupine: Feed audio frames to porcupine.process(frame)
    // 4. For browser: Start SpeechRecognition and check interim results
    // 5. When detected, call all registered callbacks

    console.log(
      `[WakeWord] Listening for wake phrase "${this.config.phrase}"...`,
    );
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    this.isListening = false;

    // Placeholder: Would release microphone resources and stop the processor.
    // - porcupine.release()
    // - recognition.stop()
    // - audioContext.close()

    console.log('[WakeWord] Stopped listening');
  }

  async updateConfig(updates: Partial<WakeWordConfig>): Promise<WakeWordConfig> {
    const wasListening = this.isListening;
    if (wasListening) await this.stopListening();

    this.config = { ...this.config, ...updates };
    this.configHistory.push({ config: { ...this.config }, setAt: new Date() });

    if (wasListening) await this.startListening();
    return this.config;
  }

  onWakeWordDetected(callback: () => void): void {
    this.callbacks.push(callback);
  }

  removeCallback(callback: () => void): void {
    this.callbacks = this.callbacks.filter((cb) => cb !== callback);
  }

  // For testing: manually trigger detection
  simulateDetection(): void {
    console.log(`[WakeWord] Wake word "${this.config.phrase}" detected!`);
    for (const callback of this.callbacks) {
      callback();
    }
  }

  /**
   * Process an audio frame for wake word detection.
   * In production, this would feed the frame to the detection model.
   */
  processAudioFrame(_frame: Float32Array): boolean {
    if (!this.isListening || !this.config.enabled) return false;

    // Placeholder: In production, this would feed the audio frame to the
    // wake word detection model and return true if the wake phrase is detected.
    // For now, this is a no-op that returns false.
    // Production: return this.detector.process(frame);
    return false;
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
}

export const wakeWordService = new WakeWordService();
export { WakeWordService, DEFAULT_WAKE_WORD_CONFIG };
