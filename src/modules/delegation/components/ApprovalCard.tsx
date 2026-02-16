'use client';

import React from 'react';
import type { DelegationTask } from '../types';

interface Props {
  delegation: DelegationTask;
  onApprove: (delegationId: string, stepOrder: number) => void;
  onReject: (delegationId: string, stepOrder: number) => void;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: '#f3f4f6', text: '#6b7280' },
  IN_REVIEW: { bg: '#fef3c7', text: '#92400e' },
  APPROVED: { bg: '#dcfce7', text: '#166534' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b' },
  COMPLETED: { bg: '#dbeafe', text: '#1e40af' },
};

export function ApprovalCard({ delegation, onApprove, onReject }: Props) {
  const colors = statusColors[delegation.status] || statusColors.PENDING;
  const pendingStep = delegation.approvalChain.find((s) => s.status === 'PENDING');

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontWeight: 600 }}>Task: {delegation.taskId}</span>
        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', backgroundColor: colors.bg, color: colors.text }}>
          {delegation.status}
        </span>
      </div>

      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
        {delegation.contextPack.summary}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {delegation.approvalChain.map((step) => {
          const stepColors = step.status === 'APPROVED' ? '#dcfce7' : step.status === 'REJECTED' ? '#fee2e2' : '#f3f4f6';
          return (
            <span key={step.order} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: stepColors }}>
              {step.role}: {step.status}
            </span>
          );
        })}
      </div>

      {pendingStep && delegation.status !== 'REJECTED' && delegation.status !== 'COMPLETED' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onApprove(delegation.id, pendingStep.order)}
            style={{ padding: '6px 16px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
          >
            Approve ({pendingStep.role})
          </button>
          <button
            onClick={() => onReject(delegation.id, pendingStep.order)}
            style={{ padding: '6px 16px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
          >
            Reject
          </button>
        </div>
      )}

      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
        Delegated: {delegation.delegatedAt.toLocaleDateString()} | To: {delegation.delegatedTo}
      </div>
    </div>
  );
}
