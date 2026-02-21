// Services
export { commandParser } from './services/command-parser';
export { sttService } from './services/stt-service';
export { voiceForgeHandoffService } from './services/voiceforge-handoff';
export { wakeWordService } from './services/wake-word-service';

// Components
export {
  default as VoiceCaptureButton,
} from './components/VoiceCaptureButton';
export {
  default as VoiceCommandList,
} from './components/VoiceCommandList';
export {
  default as VoiceCommandOverlay,
} from './components/VoiceCommandOverlay';
export {
  default as VoiceCommandPalette,
} from './components/VoiceCommandPalette';
export {
  default as TranscriptionViewer,
} from './components/TranscriptionViewer';
export {
  default as WakeWordSettings,
} from './components/WakeWordSettings';
export {
  default as VoiceActivityIndicator,
  CompactVoiceIndicator,
} from './components/VoiceActivityIndicator';
export { default as STTControls } from './components/STTControls';
export {
  default as VoiceHistoryList,
} from './components/VoiceHistoryList';
export {
  default as MicrophoneSelector,
} from './components/MicrophoneSelector';

// Types
export type {
  VoiceSession,
  ParsedVoiceCommand,
  VoiceIntent,
  ExtractedEntity,
  VoiceCommandDefinition,
  STTConfig,
  WakeWordConfig,
  VoiceForgeHandoff,
  STTProvider,
  WakeWordStatus,
  WakeWordDetectionEvent,
  WakeWordCallback,
  WakeWordEngineType,
  WakeWordEngineInfo,
  WakeWordTestResult,
  WakeWordEngine,
} from './types';
