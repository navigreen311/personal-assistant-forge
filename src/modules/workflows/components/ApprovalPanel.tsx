'use client';

import React, { useState, useCallback } from 'react';
import type { ApprovalRequest } from '@/modules/workflows/types';

// ============================================================================
// Approval Panel — List of pending approval requests with approve/reject
// ============================================================================

interface ApprovalPanelProps {
  approvals: ApprovalRequest[];
  onApprove: (approvalId: string, comment?: string) => void;
  onReject: (approvalId: string, comment?: string) => void;
}

export default function ApprovalPanel({
  approvals,
  onApprove,
  onReject,
}: ApprovalPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Pending Approvals</h3>
        {approvals.length > 0 && (
          <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-orange-500 rounded-full">
            {approvals.length}
          </span>
        )}
      </div>

      {approvals.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-gray-500">No pending approvals</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={onApprove}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: (approvalId: string, comment?: string) => void;
  onReject: (approvalId: string, comment?: string) => void;
}

function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);

  const handleApprove = useCallback(() => {
    onApprove(approval.id, comment || undefined);
  }, [approval.id, comment, onApprove]);

  const handleReject = useCallback(() => {
    onReject(approval.id, comment || undefined);
  }, [approval.id, comment, onReject]);

  const [now] = useState(() => Date.now());
  const timeUntilExpiry = approval.expiresAt
    ? new Date(approval.expiresAt).getTime() - now
    : 0;
  const isUrgent = timeUntilExpiry > 0 && timeUntilExpiry < 3600000; // < 1 hour

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="text-sm font-medium text-gray-900">{approval.workflowName}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{approval.stepLabel}</p>
        </div>
        {isUrgent && (
          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
            Urgent
          </span>
        )}
      </div>

      <p className="text-sm text-gray-700 mb-3">{approval.message}</p>

      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span>
          {approval.currentApprovals}/{approval.requiredApprovals} approvals
        </span>
        <span>
          Expires{' '}
          {approval.expiresAt
            ? new Date(approval.expiresAt).toLocaleString()
            : 'N/A'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-green-500 rounded-full transition-all"
          style={{
            width: `${(approval.currentApprovals / approval.requiredApprovals) * 100}%`,
          }}
        />
      </div>

      {/* Comment toggle */}
      <button
        onClick={() => setShowComment(!showComment)}
        className="text-xs text-blue-600 hover:text-blue-700 mb-2"
      >
        {showComment ? 'Hide comment' : 'Add comment'}
      </button>

      {showComment && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment..."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md mb-3 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-y"
        />
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
        >
          Approve
        </button>
        <button
          onClick={handleReject}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
