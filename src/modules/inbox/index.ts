// T-005: `getCurrentUserId` was re-exported from here. It is gone -- see the
// note where it stood in ./inbox.service. Identity comes from the session, via
// withAuth / withEntityScope; it is never re-derived inside the module.
export { InboxService } from './inbox.service';
export { TriageService } from './triage.service';
export { DraftService } from './draft.service';
export * from './inbox.types';
export * from './inbox.validation';
