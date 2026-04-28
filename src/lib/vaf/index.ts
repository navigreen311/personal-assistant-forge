// Barrel export for the WS01 VAF voice + audio-quality clients only.
// Other workstreams own their own files and add their own re-exports
// in their own barrels — do not consolidate here cross-workstream.

export {
  VAFSpeechToText,
  type VAFTranscriptionRequest,
  type VAFTranscriptionResult,
  type VAFTranscriptionWord,
  type VAFStreamingSession,
  type VAFStreamingOptions,
} from './stt-client';

export {
  VAFTextToSpeech,
  type VAFSpeechRequest,
  type VAFVoice,
  type VAFSynthesisResult,
  type VAFTtsStreamingOptions,
  type VAFTtsStreamingSession,
} from './tts-client';

export {
  VAFAudioQuality,
  type AudioQualityReport,
  type AudioQualityOptions,
} from './audio-quality-client';

export { isVAFAvailable } from './health';
