// ============================================================================
// Shadow Voice Agent — Action Classifier
// Hardcoded classification map for all voice-triggered actions.
// Determines confirmation level, reversibility, and blast radius.
// ============================================================================

export type ConfirmationLevel = 'NONE' | 'TAP' | 'CONFIRM_PHRASE' | 'VOICE_PIN';

export type BlastRadiusScope = 'self' | 'entity' | 'external' | 'public';

export interface ActionClassification {
  actionType: string;
  confirmationLevel: ConfirmationLevel;
  reversible: boolean;
  blastRadius: BlastRadiusScope;
  description: string;
}

interface ActionDefinition {
  confirmationLevel: ConfirmationLevel;
  reversible: boolean;
  blastRadius: BlastRadiusScope;
  description: string;
}

/**
 * Hardcoded classification map for all known action types.
 * NONE = just do it (no confirmation needed)
 * TAP = button confirm in UI
 * CONFIRM_PHRASE = user must say "confirm send" or similar
 * VOICE_PIN = user must provide their voice PIN
 */
const ACTION_CLASSIFICATION_MAP: Record<string, ActionDefinition> = {
  // NONE — low-risk, read-only or self-scoped actions
  navigate_page: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Navigate to a page in the application',
  },
  read_data: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Read or view existing data',
  },
  create_task: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Create a new task in the system',
  },
  draft_email: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Draft an email without sending it',
  },
  classify_email: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Classify or triage an email',
  },
  search_knowledge: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Search the knowledge base',
  },

  // TAP — entity-scoped mutations that are reversible
  modify_calendar: {
    confirmationLevel: 'TAP',
    reversible: true,
    blastRadius: 'entity',
    description: 'Modify a calendar event (create, update, delete)',
  },
  complete_task: {
    confirmationLevel: 'TAP',
    reversible: true,
    blastRadius: 'entity',
    description: 'Mark a task as completed',
  },
  create_invoice: {
    confirmationLevel: 'TAP',
    reversible: true,
    blastRadius: 'entity',
    description: 'Create a new invoice',
  },

  // CONFIRM_PHRASE — external-facing actions, potentially irreversible
  send_email: {
    confirmationLevel: 'CONFIRM_PHRASE',
    reversible: false,
    blastRadius: 'external',
    description: 'Send an email to an external recipient',
  },
  trigger_workflow: {
    confirmationLevel: 'CONFIRM_PHRASE',
    reversible: false,
    blastRadius: 'external',
    description: 'Trigger an automated workflow',
  },
  place_call: {
    confirmationLevel: 'CONFIRM_PHRASE',
    reversible: false,
    blastRadius: 'external',
    description: 'Place an outbound phone call',
  },
  send_invoice: {
    confirmationLevel: 'CONFIRM_PHRASE',
    reversible: false,
    blastRadius: 'external',
    description: 'Send an invoice to a client or vendor',
  },

  // VOICE_PIN — highest risk actions, public blast radius or bulk operations
  bulk_email: {
    confirmationLevel: 'VOICE_PIN',
    reversible: false,
    blastRadius: 'public',
    description: 'Send bulk email to multiple recipients',
  },
  declare_crisis: {
    confirmationLevel: 'VOICE_PIN',
    reversible: false,
    blastRadius: 'public',
    description: 'Declare a crisis and activate crisis protocols',
  },
  make_payment: {
    confirmationLevel: 'VOICE_PIN',
    reversible: false,
    blastRadius: 'external',
    description: 'Make a financial payment or transfer',
  },
  delete_data: {
    confirmationLevel: 'VOICE_PIN',
    reversible: false,
    blastRadius: 'entity',
    description: 'Permanently delete data from the system',
  },
  activate_phone_tree: {
    confirmationLevel: 'VOICE_PIN',
    reversible: false,
    blastRadius: 'public',
    description: 'Activate the phone tree for mass notifications',
  },
};

/**
 * Default classification for unknown action types.
 * Defaults to the most restrictive level for safety.
 */
const DEFAULT_CLASSIFICATION: ActionDefinition = {
  confirmationLevel: 'VOICE_PIN',
  reversible: false,
  blastRadius: 'external',
  description: 'Unknown action type — defaulting to highest security',
};

/**
 * Classify an action type to determine its safety requirements.
 *
 * Returns the confirmation level, reversibility, and blast radius
 * for the given action. Unknown actions default to the most
 * restrictive classification (VOICE_PIN) for safety.
 */
export function classifyAction(actionType: string): ActionClassification {
  const definition = ACTION_CLASSIFICATION_MAP[actionType] ?? DEFAULT_CLASSIFICATION;

  return {
    actionType,
    ...definition,
  };
}

/**
 * Get all known action types and their classifications.
 * Useful for admin dashboards and configuration UIs.
 */
export function getAllClassifications(): ActionClassification[] {
  return Object.entries(ACTION_CLASSIFICATION_MAP).map(([actionType, definition]) => ({
    actionType,
    ...definition,
  }));
}

/**
 * Get all action types for a given confirmation level.
 */
export function getActionsByLevel(level: ConfirmationLevel): ActionClassification[] {
  return Object.entries(ACTION_CLASSIFICATION_MAP)
    .filter(([, definition]) => definition.confirmationLevel === level)
    .map(([actionType, definition]) => ({
      actionType,
      ...definition,
    }));
}

/**
 * Check if a given action type is known to the classifier.
 */
export function isKnownAction(actionType: string): boolean {
  return actionType in ACTION_CLASSIFICATION_MAP;
}
