// ============================================================================
// Shadow Voice Agent — Safety Module Barrel Export
// ============================================================================

// Action Classifier
export {
  classifyAction,
  getAllClassifications,
  getActionsByLevel,
  isKnownAction,
} from './action-classifier';
export type {
  ConfirmationLevel,
  BlastRadiusScope,
  ActionClassification,
} from './action-classifier';

// Fraud Detector
export {
  detectFraud,
  detectAllFraudPatterns,
  containsPromptInjection,
} from './fraud-detector';
export type {
  FraudSeverity,
  FraudPattern,
  FraudCheckResult,
  FraudDetectorParams,
} from './fraud-detector';

// Auth Manager
export {
  ShadowAuthManager,
  shadowAuthManager,
} from './auth-manager';
export type {
  TrustedDevice,
  AddDeviceParams,
  AuthRequirement,
  DetermineAuthParams,
} from './auth-manager';

// Consent Receipt Service
export {
  ConsentReceiptService,
  consentReceiptService,
} from './consent-receipt';
export type {
  CreateReceiptParams,
  ListReceiptsParams,
  ConsentReceiptRecord,
  RollbackResult,
} from './consent-receipt';
