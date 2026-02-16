'use client';

import React, { useState, useCallback } from 'react';
import type {
  WorkflowNode,
  WorkflowNodeConfig,
  TriggerNodeConfig,
  ActionNodeConfig,
  ConditionNodeConfig,
  AIDecisionNodeConfig,
  HumanApprovalNodeConfig,
  DelayNodeConfig,
  LoopNodeConfig,
  ErrorHandlerNodeConfig,
  SubWorkflowNodeConfig,
} from '@/modules/workflows/types';

// ============================================================================
// Node Config Panel — Slide-out panel for configuring a selected node
// ============================================================================

interface NodeConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (node: WorkflowNode) => void;
  onClose: () => void;
}

export default function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
}: NodeConfigPanelProps) {
  const [testOutput, setTestOutput] = useState<string | null>(null);

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ ...node, label: e.target.value });
    },
    [node, onUpdate]
  );

  const handleConfigChange = useCallback(
    (config: WorkflowNodeConfig) => {
      onUpdate({ ...node, config });
    },
    [node, onUpdate]
  );

  const handleTestNode = useCallback(() => {
    setTestOutput(
      JSON.stringify(
        {
          status: 'success',
          message: `Test run for ${node.label} (${node.type})`,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
  }, [node]);

  return (
    <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Configure Node</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          &times;
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
          <input
            type="text"
            value={node.label}
            onChange={handleLabelChange}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Type Badge */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <span className="inline-block px-2 py-1 text-xs font-medium bg-gray-100 rounded">
            {node.type}
          </span>
        </div>

        {/* Dynamic Config Form */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">
            Configuration
          </h4>
          <ConfigForm config={node.config} onChange={handleConfigChange} />
        </div>

        {/* Test Button */}
        <div className="border-t border-gray-200 pt-4">
          <button
            onClick={handleTestNode}
            className="w-full px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Test Node
          </button>
          {testOutput && (
            <pre className="mt-2 p-2 text-xs bg-gray-50 rounded-md overflow-auto max-h-40 border">
              {testOutput}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Dynamic Config Form ---

interface ConfigFormProps {
  config: WorkflowNodeConfig;
  onChange: (config: WorkflowNodeConfig) => void;
}

function ConfigForm({ config, onChange }: ConfigFormProps) {
  switch (config.nodeType) {
    case 'TRIGGER':
      return <TriggerConfigForm config={config} onChange={onChange} />;
    case 'ACTION':
      return <ActionConfigForm config={config} onChange={onChange} />;
    case 'CONDITION':
      return <ConditionConfigForm config={config} onChange={onChange} />;
    case 'AI_DECISION':
      return <AIDecisionConfigForm config={config} onChange={onChange} />;
    case 'HUMAN_APPROVAL':
      return <HumanApprovalConfigForm config={config} onChange={onChange} />;
    case 'DELAY':
      return <DelayConfigForm config={config} onChange={onChange} />;
    case 'LOOP':
      return <LoopConfigForm config={config} onChange={onChange} />;
    case 'ERROR_HANDLER':
      return <ErrorHandlerConfigForm config={config} onChange={onChange} />;
    case 'SUB_WORKFLOW':
      return <SubWorkflowConfigForm config={config} onChange={onChange} />;
    default:
      return <p className="text-xs text-gray-500">No configuration available</p>;
  }
}

function TriggerConfigForm({ config, onChange }: { config: TriggerNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <SelectField
        label="Trigger Type"
        value={config.triggerType}
        options={['TIME', 'EVENT', 'CONDITION', 'MANUAL', 'VOICE', 'WEBHOOK']}
        onChange={(v) => onChange({ ...config, triggerType: v as TriggerNodeConfig['triggerType'] })}
      />
      {config.triggerType === 'TIME' && (
        <TextField
          label="Cron Expression"
          value={config.cronExpression ?? ''}
          onChange={(v) => onChange({ ...config, cronExpression: v })}
          placeholder="0 9 * * MON-FRI"
        />
      )}
      {config.triggerType === 'EVENT' && (
        <TextField
          label="Event Name"
          value={config.eventName ?? ''}
          onChange={(v) => onChange({ ...config, eventName: v })}
          placeholder="contact.created"
        />
      )}
      {config.triggerType === 'WEBHOOK' && (
        <TextField
          label="Webhook Path"
          value={config.webhookPath ?? ''}
          onChange={(v) => onChange({ ...config, webhookPath: v })}
          placeholder="/api/webhooks/my-trigger"
        />
      )}
    </div>
  );
}

function ActionConfigForm({ config, onChange }: { config: ActionNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <SelectField
        label="Action Type"
        value={config.actionType}
        options={[
          'SEND_MESSAGE', 'CREATE_TASK', 'UPDATE_RECORD', 'GENERATE_DOCUMENT',
          'CALL_API', 'TRIGGER_AI_ANALYSIS', 'SEND_NOTIFICATION', 'CREATE_EVENT',
          'UPDATE_CONTACT', 'LOG_FINANCIAL', 'EXECUTE_SCRIPT',
        ]}
        onChange={(v) => onChange({ ...config, actionType: v as ActionNodeConfig['actionType'] })}
      />
      <NumberField
        label="Timeout (ms)"
        value={config.timeout ?? 30000}
        onChange={(v) => onChange({ ...config, timeout: v })}
      />
    </div>
  );
}

function ConditionConfigForm({ config, onChange }: { config: ConditionNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <TextField
        label="Expression"
        value={config.expression}
        onChange={(v) => onChange({ ...config, expression: v })}
        placeholder="data.amount > 1000"
      />
      <TextField
        label="True Output Node ID"
        value={config.trueOutputId}
        onChange={(v) => onChange({ ...config, trueOutputId: v })}
      />
      <TextField
        label="False Output Node ID"
        value={config.falseOutputId}
        onChange={(v) => onChange({ ...config, falseOutputId: v })}
      />
    </div>
  );
}

function AIDecisionConfigForm({ config, onChange }: { config: AIDecisionNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <SelectField
        label="Decision Type"
        value={config.decisionType}
        options={['CLASSIFY', 'SCORE', 'DRAFT', 'SUMMARIZE', 'RECOMMEND', 'EXTRACT']}
        onChange={(v) => onChange({ ...config, decisionType: v as AIDecisionNodeConfig['decisionType'] })}
      />
      <TextAreaField
        label="Prompt"
        value={config.prompt}
        onChange={(v) => onChange({ ...config, prompt: v })}
        placeholder="Classify this contact inquiry..."
      />
      <NumberField
        label="Confidence Threshold"
        value={config.confidenceThreshold ?? 0.7}
        onChange={(v) => onChange({ ...config, confidenceThreshold: v })}
        step={0.1}
        min={0}
        max={1}
      />
    </div>
  );
}

function HumanApprovalConfigForm({ config, onChange }: { config: HumanApprovalNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <TextAreaField
        label="Approval Message"
        value={config.message}
        onChange={(v) => onChange({ ...config, message: v })}
        placeholder="Please review and approve..."
      />
      <NumberField
        label="Timeout (hours)"
        value={config.timeoutHours}
        onChange={(v) => onChange({ ...config, timeoutHours: v })}
      />
      <NumberField
        label="Required Approvals"
        value={config.requiredApprovals}
        onChange={(v) => onChange({ ...config, requiredApprovals: v })}
        min={1}
      />
    </div>
  );
}

function DelayConfigForm({ config, onChange }: { config: DelayNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <SelectField
        label="Delay Type"
        value={config.delayType}
        options={['FIXED', 'UNTIL', 'BUSINESS_HOURS']}
        onChange={(v) => onChange({ ...config, delayType: v as DelayNodeConfig['delayType'] })}
      />
      {config.delayType === 'FIXED' && (
        <NumberField
          label="Delay (ms)"
          value={config.delayMs ?? 0}
          onChange={(v) => onChange({ ...config, delayMs: v })}
        />
      )}
      {config.delayType === 'UNTIL' && (
        <TextField
          label="Delay Until"
          value={config.delayUntil ?? ''}
          onChange={(v) => onChange({ ...config, delayUntil: v })}
          placeholder="2026-01-01T09:00:00Z"
        />
      )}
    </div>
  );
}

function LoopConfigForm({ config, onChange }: { config: LoopNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <TextField
        label="Collection Variable"
        value={config.collection}
        onChange={(v) => onChange({ ...config, collection: v })}
        placeholder="items"
      />
      <TextField
        label="Iterator Variable"
        value={config.iteratorVariable}
        onChange={(v) => onChange({ ...config, iteratorVariable: v })}
        placeholder="item"
      />
      <NumberField
        label="Max Iterations"
        value={config.maxIterations}
        onChange={(v) => onChange({ ...config, maxIterations: v })}
      />
    </div>
  );
}

function ErrorHandlerConfigForm({ config, onChange }: { config: ErrorHandlerNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <TextField
        label="Error Types (comma-separated)"
        value={config.errorTypes.join(', ')}
        onChange={(v) =>
          onChange({
            ...config,
            errorTypes: v.split(',').map((s) => s.trim()).filter(Boolean),
          })
        }
        placeholder="*, TimeoutError"
      />
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={config.notifyOnError}
          onChange={(e) => onChange({ ...config, notifyOnError: e.target.checked })}
          className="rounded border-gray-300"
        />
        <span className="text-xs text-gray-700">Notify on error</span>
      </div>
    </div>
  );
}

function SubWorkflowConfigForm({ config, onChange }: { config: SubWorkflowNodeConfig; onChange: (c: WorkflowNodeConfig) => void }) {
  return (
    <div className="space-y-3">
      <TextField
        label="Workflow ID"
        value={config.workflowId}
        onChange={(v) => onChange({ ...config, workflowId: v })}
        placeholder="workflow-id"
      />
    </div>
  );
}

// --- Reusable Field Components ---

function TextField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-y"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}
