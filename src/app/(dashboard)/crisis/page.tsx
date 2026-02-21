'use client';

import { useEffect, useState } from 'react';
import CrisisAlertBanner from '@/modules/crisis/components/CrisisAlertBanner';
import CrisisDashboard from '@/modules/crisis/components/CrisisDashboard';
import EscalationTimeline from '@/modules/crisis/components/EscalationTimeline';
import PlaybookProgress from '@/modules/crisis/components/PlaybookProgress';
import WarRoomPanel from '@/modules/crisis/components/WarRoomPanel';
import DeadManSwitchConfig from '@/modules/crisis/components/DeadManSwitchConfig';
import PhoneTreeVisualization from '@/modules/crisis/components/PhoneTreeVisualization';
import type { CrisisEvent, DeadManSwitch, PhoneTreeNode } from '@/modules/crisis/types';

// Fallback demo data for crisis if API fetch fails
const sampleCrisis: CrisisEvent = {
  id: 'crisis-1',
  userId: 'user-1',
  entityId: 'entity-1',
  type: 'DATA_BREACH',
  severity: 'CRITICAL',
  status: 'IN_PROGRESS',
  title: 'Unauthorized Access to Customer Database',
  description: 'Security team detected unauthorized access patterns to the customer database from an unknown IP address.',
  detectedAt: new Date('2026-02-15T10:30:00'),
  acknowledgedAt: new Date('2026-02-15T10:35:00'),
  escalationChain: [
    { order: 1, contactName: 'CTO', contactMethod: 'PHONE', escalateAfterMinutes: 5, status: 'ACKNOWLEDGED', notifiedAt: new Date('2026-02-15T10:31:00'), acknowledgedAt: new Date('2026-02-15T10:33:00') },
    { order: 2, contactName: 'Security Team Lead', contactMethod: 'PHONE', escalateAfterMinutes: 10, status: 'NOTIFIED', notifiedAt: new Date('2026-02-15T10:31:00') },
    { order: 3, contactName: 'Legal Counsel', contactMethod: 'PHONE', escalateAfterMinutes: 20, status: 'PENDING' },
  ],
  playbook: {
    id: 'pb-1', name: 'Data Breach Response', crisisType: 'DATA_BREACH', estimatedResolutionHours: 72,
    steps: [
      { order: 1, title: 'Contain the breach', description: 'Isolate affected systems.', actionType: 'TECHNICAL', isAutomatable: true, isComplete: true, completedAt: new Date('2026-02-15T10:40:00') },
      { order: 2, title: 'Assess scope', description: 'Determine impact.', actionType: 'TECHNICAL', isAutomatable: false, isComplete: false },
      { order: 3, title: 'Notify legal', description: 'Inform legal counsel.', actionType: 'LEGAL', isAutomatable: true, isComplete: false },
      { order: 4, title: 'Notify affected parties', description: 'Send notifications.', actionType: 'COMMUNICATION', isAutomatable: true, isComplete: false },
      { order: 5, title: 'Regulatory filing', description: 'File regulatory notifications.', actionType: 'LEGAL', isAutomatable: false, isComplete: false },
      { order: 6, title: 'Post-mortem', description: 'Conduct review.', actionType: 'DOCUMENTATION', isAutomatable: false, isComplete: false },
    ],
  },
  warRoom: {
    isActive: true,
    activatedAt: new Date('2026-02-15T10:36:00'),
    clearedCalendarEvents: ['team-standup', 'weekly-review'],
    surfacedDocuments: ['incident-response-plan', 'data-breach-playbook'],
    draftedComms: ['Initial breach notification draft', 'Customer communication template'],
    participants: ['CTO', 'Security Team Lead'],
  },
};

const sampleDMS: DeadManSwitch = {
  userId: 'user-1',
  isEnabled: true,
  checkInIntervalHours: 24,
  lastCheckIn: new Date(),
  missedCheckIns: 0,
  triggerAfterMisses: 3,
  protocols: [
    { order: 1, action: 'Notify emergency contact', contactName: 'Jane Doe', message: 'User has not checked in for 72 hours.', delayHoursAfterTrigger: 0 },
    { order: 2, action: 'Notify lawyer', contactName: 'Legal Counsel', message: 'Initiate emergency protocol.', delayHoursAfterTrigger: 24 },
  ],
};

const samplePhoneTree: PhoneTreeNode[] = [
  {
    contactId: 'c-1', contactName: 'CTO', phone: '+1-555-0101', order: 1, role: 'Primary',
    children: [
      { contactId: 'c-2', contactName: 'Security Lead', phone: '+1-555-0102', order: 2, role: 'Backup', children: [] },
      { contactId: 'c-3', contactName: 'Legal Counsel', phone: '+1-555-0103', order: 3, role: 'Legal', children: [] },
    ],
  },
];

export default function CrisisPage() {
  const [crises, setCrises] = useState<CrisisEvent[] | null>(null);
  const [dms, setDms] = useState<DeadManSwitch | null>(null);
  const [phoneTree, setPhoneTree] = useState<PhoneTreeNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const results = await Promise.allSettled([
          fetch('/api/crisis').then((r) => r.json()),
          fetch('/api/crisis/dms').then((r) => r.json()),
          fetch('/api/crisis/phone-tree').then((r) => r.json()),
        ]);

        if (results[0].status === 'fulfilled' && results[0].value?.data) {
          setCrises(results[0].value.data);
        }
        if (results[1].status === 'fulfilled' && results[1].value?.data) {
          setDms(results[1].value.data);
        }
        if (results[2].status === 'fulfilled' && results[2].value?.data) {
          setPhoneTree(results[2].value.data);
        }
      } catch {
        setError('Failed to load crisis data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Fallback to demo data for sections that fail to load
  const crisesData: CrisisEvent[] = crises ?? [sampleCrisis];
  const activeCrisis: CrisisEvent = crisesData[0] ?? sampleCrisis;
  const dmsData: DeadManSwitch = dms ?? sampleDMS;
  const phoneTreeData: PhoneTreeNode[] = phoneTree ?? samplePhoneTree;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading crisis data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Crisis Management</h1>

      <CrisisAlertBanner crisis={activeCrisis} />

      <div className="bg-white rounded-lg shadow p-6">
        <CrisisDashboard crises={crisesData} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <EscalationTimeline steps={activeCrisis.escalationChain} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          {activeCrisis.playbook && <PlaybookProgress playbook={activeCrisis.playbook} />}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <WarRoomPanel state={activeCrisis.warRoom} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <DeadManSwitchConfig config={dmsData} onSave={() => {}} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <PhoneTreeVisualization tree={phoneTreeData} />
        </div>
      </div>
    </div>
  );
}
