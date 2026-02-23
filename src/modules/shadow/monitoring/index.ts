// ============================================================================
// Shadow Voice Agent — Monitoring Module Index
// Re-exports all monitoring services for convenient importing.
// ============================================================================

export { TelemetryTracker, createTelemetryTracker } from './telemetry';
export type { TelemetrySnapshot, ToolCallTelemetry } from './telemetry';

export { FailoverManager, failoverManager } from './failover';
export type { FailoverParams, FailoverResult } from './failover';

export { SyntheticMonitor, syntheticMonitor } from './synthetic-tests';
export type { TestResult, SyntheticTestSuiteResult } from './synthetic-tests';
