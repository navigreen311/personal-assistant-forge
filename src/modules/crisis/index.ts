// Services
export {
  configure,
  checkIn,
  evaluateSwitch,
  getStatus,
  addProtocol,
} from './services/dead-man-switch-service';
export {
  analyzeSignals,
  createCrisisEvent,
  getActiveCrises,
  getCrisisById,
  updateCrisis,
} from './services/detection-service';
export {
  getEscalationChain,
  setEscalationChain,
  executeEscalation,
  acknowledgeEscalation,
  getEscalationStatus,
} from './services/escalation-service';
export {
  buildPhoneTree,
  getPhoneTree,
  updatePhoneTree,
} from './services/phone-tree-service';
export {
  getPlaybook,
  executePlaybookStep,
  getCustomPlaybooks,
  createPlaybook,
} from './services/playbook-service';
export {
  generateReview,
  addActionItem,
  addLessonLearned,
} from './services/post-incident-service';
export {
  activateWarRoom,
  deactivateWarRoom,
  getWarRoomState,
  addWarRoomDocument,
} from './services/war-room-service';

// Types
export type {
  CrisisType,
  CrisisSeverity,
  CrisisStatus,
  CrisisEvent,
  CrisisDetectionSignal,
  EscalationStep,
  EscalationChainConfig,
  CrisisPlaybook,
  PlaybookAction,
  WarRoomState,
  PostIncidentReview,
  DeadManSwitch,
  DeadManProtocol,
  PhoneTreeNode,
} from './types';
