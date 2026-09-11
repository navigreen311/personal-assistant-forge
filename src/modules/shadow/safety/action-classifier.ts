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

  // ==========================================================================
  // P-17 (Sprint 6) — THE NAMES THE RUNTIME ACTUALLY CLASSIFIES
  // ==========================================================================
  //
  // Everything above this line is the original eighteen entries; none of them
  // are changed, and nothing below lowers any of them.
  //
  // The problem being fixed: `classifyAction` is called with TOOL NAMES (by
  // `consent-receipt.ts` for every receipt, and now by `auth-manager.ts` for
  // every step-up decision), and the map above was written in a different
  // vocabulary. Of the 29 tools `agent/tool-router.ts` exposes, exactly SEVEN
  // appeared above -- `create_task`, `draft_email`, `classify_email`,
  // `complete_task`, `create_invoice`, `send_email`, `trigger_workflow`. The
  // other 22, including every read-only listing tool, fell through to
  // `DEFAULT_CLASSIFICATION` and were classified VOICE_PIN / irreversible /
  // external.
  //
  // That default is the right default -- an unknown action should be treated as
  // the most dangerous one. But it is a default for the UNKNOWN, and these 22
  // are not unknown: they are the platform's own tools. Leaving them there has
  // two costs, and the second is the dangerous one:
  //
  //   1. `get_dashboard_stats` would demand a voice PIN, which is the kind of
  //      friction that gets a security gate switched off rather than fixed.
  //   2. Every consent receipt the agent wrote recorded `reversible: false`
  //      and `blastRadius: 'external'` for a created task. A receipt is the
  //      audit record of what an action's blast radius WAS; a receipt saying a
  //      calendar edit was external and irreversible is not a small
  //      inaccuracy, it is the audit trail being wrong.
  //
  // Aliases are included where the two vocabularies spell the same action
  // differently (`navigate` / `navigate_page` / `navigate_to_page`,
  // `modify_calendar` / `modify_calendar_event`, `search_knowledge` /
  // `search_knowledge_base`), because both spellings genuinely reach here:
  // `IntentCategory` uses one and `tool-router.ts` the other.

  // --- Read-only tools. NONE / self / reversible. ---------------------------
  navigate: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Navigate to a page in the application',
  },
  navigate_to_page: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Navigate to a page in the application',
  },
  get_dashboard_stats: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Read dashboard statistics',
  },
  list_tasks: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'List tasks',
  },
  list_inbox: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'List inbox messages',
  },
  list_calendar_events: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'List calendar events',
  },
  list_contacts: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'List contacts',
  },
  get_contact: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Read a single contact',
  },
  list_invoices: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'List invoices',
  },
  get_finance_summary: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Read a financial summary',
  },
  list_expenses: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'List expenses',
  },
  search_knowledge_base: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Search the knowledge base',
  },
  get_workflow_status: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Read the status of a workflow run',
  },
  get_entity_list: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'List the entities the user owns',
  },
  list_projects: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'List projects',
  },
  get_project_status: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Read the status of a project',
  },
  general_question: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Answer a question without taking an action',
  },
  switch_entity: {
    confirmationLevel: 'NONE',
    reversible: true,
    blastRadius: 'self',
    description: 'Switch the session to a different entity the user owns',
  },

  // --- Reversible mutations inside the entity. TAP. -------------------------
  update_task: {
    confirmationLevel: 'TAP',
    reversible: true,
    blastRadius: 'entity',
    description: 'Update an existing task',
  },
  create_calendar_event: {
    confirmationLevel: 'TAP',
    reversible: true,
    blastRadius: 'entity',
    description: 'Create a calendar event',
  },
  modify_calendar_event: {
    confirmationLevel: 'TAP',
    reversible: true,
    blastRadius: 'entity',
    description: 'Modify a calendar event',
  },
  create_contact: {
    confirmationLevel: 'TAP',
    reversible: true,
    blastRadius: 'entity',
    description: 'Create a contact',
  },
  add_knowledge_entry: {
    confirmationLevel: 'TAP',
    reversible: true,
    blastRadius: 'entity',
    description: 'Add an entry to the knowledge base',
  },

  // --- Leaves the building. CONFIRM_PHRASE / external / irreversible. -------
  //
  // `send_invoice_reminder` sends mail to a client. It is the tool behind the
  // `send_invoice` intent above and carries that intent's classification, not
  // `create_invoice`'s.
  send_invoice_reminder: {
    confirmationLevel: 'CONFIRM_PHRASE',
    reversible: false,
    blastRadius: 'external',
    description: 'Send an invoice reminder to a client or vendor',
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
