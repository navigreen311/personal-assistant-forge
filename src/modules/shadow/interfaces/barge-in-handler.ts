// ============================================================================
// Shadow Voice Agent — Barge-In Handler
// Detects when users speak during Shadow's response, manages pause/resume
// lifecycle, and auto-prompts after idle periods.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceActivityResult {
  isSpeaking: boolean;
  confidence: number;
}

export interface BargeInParams {
  sessionId: string;
  transcript: string;
  currentResponseId: string;
}

export interface BargeInResult {
  shouldStop: boolean;
  acknowledgment: string;
}

export interface SessionPauseState {
  isPaused: boolean;
  pausedAt: number | null;
  lastActivityAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VOICE_THRESHOLD = 0.15;
const IDLE_PROMPT_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Phrases that signal the user wants Shadow to pause.
 * Checked via case-insensitive substring matching.
 */
const PAUSE_COMMANDS = [
  'pause',
  'hold on',
  'give me a second',
  'one moment',
  'wait',
  'hang on',
  'just a sec',
  'one sec',
  'hold that thought',
  'stop',
];

/**
 * Phrases that signal the user wants Shadow to resume.
 */
const RESUME_SIGNALS = [
  'continue',
  'go ahead',
  "i'm ready",
  'im ready',
  'resume',
  'keep going',
  'go on',
  'carry on',
  'okay',
  'ok go',
  'alright',
  'yes',
  'yeah',
  'proceed',
];

/**
 * Quick acknowledgment phrases Shadow uses when barged-in.
 * Rotated to feel natural.
 */
const ACKNOWLEDGMENTS = [
  'Sure.',
  'Got it.',
  'Right.',
  'Go ahead.',
  'Of course.',
  'Yes?',
  "I'm listening.",
  'Okay.',
];

// ---------------------------------------------------------------------------
// BargeInHandler
// ---------------------------------------------------------------------------

export class BargeInHandler {
  /**
   * Per-session pause state. In production this would be backed by Redis
   * or a session store; here we use an in-memory map.
   */
  private sessionStates: Map<string, SessionPauseState> = new Map();

  /**
   * Counter for acknowledgment rotation, so consecutive barge-ins
   * produce different phrases.
   */
  private ackIndex = 0;

  // -------------------------------------------------------------------------
  // Voice Activity Detection
  // -------------------------------------------------------------------------

  /**
   * Detect whether the user is currently speaking based on audio level.
   *
   * @param audioLevel  Normalized audio level (0.0 - 1.0) from AnalyserNode.
   * @param threshold   Level above which we consider the user speaking.
   * @returns           isSpeaking boolean and a confidence score.
   */
  detectVoiceActivity(
    audioLevel: number,
    threshold: number = DEFAULT_VOICE_THRESHOLD,
  ): VoiceActivityResult {
    const clamped = Math.min(1, Math.max(0, audioLevel));
    const isSpeaking = clamped > threshold;

    // Confidence scales from 0 at threshold to 1 at full volume
    let confidence = 0;
    if (isSpeaking) {
      confidence = Math.min(1, (clamped - threshold) / (1 - threshold));
    }

    return { isSpeaking, confidence };
  }

  // -------------------------------------------------------------------------
  // Barge-In Handling
  // -------------------------------------------------------------------------

  /**
   * Handle a barge-in event: user started speaking while Shadow is responding.
   *
   * Logic:
   * - If the transcript contains a pause command, pause the session.
   * - Otherwise, stop the current response and acknowledge.
   */
  async handleBargeIn(params: BargeInParams): Promise<BargeInResult> {
    const { sessionId, transcript } = params;
    const normalizedTranscript = transcript.trim().toLowerCase();

    // Update last activity timestamp
    this.touchSession(sessionId);

    // Check if this is a pause command
    if (this.detectPauseCommand(normalizedTranscript)) {
      this.pauseSession(sessionId);
      return {
        shouldStop: true,
        acknowledgment: 'Sure, take your time. Just say "continue" when you\'re ready.',
      };
    }

    // Check if this is a resume signal on a paused session
    const state = this.getSessionState(sessionId);
    if (state.isPaused && this.detectResumeSignal(normalizedTranscript)) {
      this.resumeSession(sessionId);
      return {
        shouldStop: false,
        acknowledgment: 'Welcome back. Where were we?',
      };
    }

    // Standard barge-in: stop current response and acknowledge
    return {
      shouldStop: true,
      acknowledgment: this.nextAcknowledgment(),
    };
  }

  // -------------------------------------------------------------------------
  // Pause / Resume Detection
  // -------------------------------------------------------------------------

  /**
   * Check whether a transcript contains a pause command.
   * Accepts either the raw transcript or a pre-lowercased string.
   */
  detectPauseCommand(transcript: string): boolean {
    const lower = transcript.toLowerCase().trim();
    return PAUSE_COMMANDS.some((cmd) => lower.includes(cmd));
  }

  /**
   * Check whether a transcript contains a resume signal.
   */
  detectResumeSignal(transcript: string): boolean {
    const lower = transcript.toLowerCase().trim();
    return RESUME_SIGNALS.some((signal) => lower.includes(signal));
  }

  // -------------------------------------------------------------------------
  // Session Pause State Management
  // -------------------------------------------------------------------------

  /**
   * Get the pause state for a session, creating a default if not found.
   */
  getSessionState(sessionId: string): SessionPauseState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = { isPaused: false, pausedAt: null, lastActivityAt: Date.now() };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Mark a session as paused.
   */
  private pauseSession(sessionId: string): void {
    const state = this.getSessionState(sessionId);
    state.isPaused = true;
    state.pausedAt = Date.now();
  }

  /**
   * Mark a session as resumed.
   */
  private resumeSession(sessionId: string): void {
    const state = this.getSessionState(sessionId);
    state.isPaused = false;
    state.pausedAt = null;
    state.lastActivityAt = Date.now();
  }

  /**
   * Update last activity timestamp for a session.
   */
  private touchSession(sessionId: string): void {
    const state = this.getSessionState(sessionId);
    state.lastActivityAt = Date.now();
  }

  // -------------------------------------------------------------------------
  // Idle Detection
  // -------------------------------------------------------------------------

  /**
   * Check whether a session has been idle long enough to prompt the user.
   * Returns an idle prompt message if applicable, null otherwise.
   */
  checkIdlePrompt(sessionId: string): string | null {
    const state = this.getSessionState(sessionId);
    const elapsed = Date.now() - state.lastActivityAt;

    if (elapsed >= IDLE_PROMPT_MS) {
      // Reset the timer so we don't spam
      state.lastActivityAt = Date.now();
      return 'Still there? Want to continue or pause for later?';
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Remove session state when a session ends. Prevents memory leaks.
   */
  clearSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }

  /**
   * Get count of tracked sessions (for monitoring).
   */
  get activeSessionCount(): number {
    return this.sessionStates.size;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Rotate through acknowledgment phrases.
   */
  private nextAcknowledgment(): string {
    const ack = ACKNOWLEDGMENTS[this.ackIndex % ACKNOWLEDGMENTS.length];
    this.ackIndex++;
    return ack;
  }
}
