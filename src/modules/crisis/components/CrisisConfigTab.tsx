'use client';

import { useState } from 'react';
import type { DeadManSwitch, DeadManProtocol } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CrisisConfigTabProps {
  entityId?: string;
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface PhoneTreeContact {
  id: string;
  name: string;
  role: string;
  designation: 'Primary' | 'Backup' | 'Legal' | 'Technical' | 'Executive';
  phone: string;
  email: string;
}

interface EscalationRule {
  id: string;
  label: string;
  enabled: boolean;
}

interface WarRoomDefault {
  id: string;
  label: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const DEFAULT_DMS: DeadManSwitch = {
  userId: '',
  isEnabled: true,
  checkInIntervalHours: 24,
  lastCheckIn: new Date(),
  missedCheckIns: 0,
  triggerAfterMisses: 3,
  protocols: [
    { order: 1, action: 'Notify primary contact', contactName: 'Jane Doe', message: 'Check-in missed — initiating protocol.', delayHoursAfterTrigger: 0 },
    { order: 2, action: 'Notify security team', contactName: 'Security Lead', message: 'Escalating: unresponsive after protocol step 1.', delayHoursAfterTrigger: 2 },
    { order: 3, action: 'Lock sensitive systems', contactName: 'CTO', message: 'Full lockdown initiated.', delayHoursAfterTrigger: 6 },
  ],
};

const DEFAULT_PHONE_TREE: PhoneTreeContact[] = [
  { id: 'pt-1', name: 'CTO', role: 'Primary', designation: 'Primary', phone: '+1-555-0101', email: 'cto@example.com' },
  { id: 'pt-2', name: 'Security Lead', role: 'Backup', designation: 'Backup', phone: '+1-555-0102', email: 'security@example.com' },
  { id: 'pt-3', name: 'Legal Counsel', role: 'Legal', designation: 'Legal', phone: '+1-555-0103', email: 'legal@example.com' },
];

const DEFAULT_ESCALATION_RULES: EscalationRule[] = [
  { id: 'er-1', label: 'Trust & Safety engine detects breach attempt', enabled: true },
  { id: 'er-2', label: 'Service uptime drops below 99% for 15+ minutes', enabled: true },
  { id: 'er-3', label: 'Multiple P0 alerts within 30 minutes', enabled: true },
  { id: 'er-4', label: 'Financial anomaly > $10,000 detected', enabled: false },
];

const DEFAULT_WAR_ROOM: WarRoomDefault[] = [
  { id: 'wr-1', label: 'Clear non-critical calendar events', enabled: true },
  { id: 'wr-2', label: 'Surface relevant documents/playbooks', enabled: true },
  { id: 'wr-3', label: 'Draft initial communications', enabled: true },
  { id: 'wr-4', label: 'Set DND except for crisis participants', enabled: true },
  { id: 'wr-5', label: 'Log all actions in Execution Layer', enabled: true },
  { id: 'wr-6', label: 'Notify all phone tree contacts', enabled: true },
];

const INTERVAL_OPTIONS = [
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
  { label: '48 hours', value: 48 },
  { label: '72 hours', value: 72 },
];
// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-2"
    >
      <span
        className={`
          relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
          border-2 border-transparent transition-colors duration-200 ease-in-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2
          ${checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow
            ring-0 transition-transform duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </span>
      {label && <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>}
    </button>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
      {children}
    </div>
  );
}
// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CrisisConfigTab({ entityId, onRefresh }: CrisisConfigTabProps) {
  // -- Dead Man's Switch --------------------------------------------------
  const [dms, setDms] = useState<DeadManSwitch>(DEFAULT_DMS);

  // -- Phone Tree ---------------------------------------------------------
  const [phoneTree, setPhoneTree] = useState<PhoneTreeContact[]>(DEFAULT_PHONE_TREE);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [phoneForm, setPhoneForm] = useState({ name: '', role: '', phone: '', email: '' });
  const [reorderMode, setReorderMode] = useState(false);
  const [useVoiceForge, setUseVoiceForge] = useState(true);

  // -- Escalation Rules ---------------------------------------------------
  const [escalationRules, setEscalationRules] = useState<EscalationRule[]>(DEFAULT_ESCALATION_RULES);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [newRuleLabel, setNewRuleLabel] = useState('');

  // -- War Room Defaults --------------------------------------------------
  const [warRoomDefaults, setWarRoomDefaults] = useState<WarRoomDefault[]>(DEFAULT_WAR_ROOM);

  // -- Editing state flags ------------------------------------------------
  const [editingDms, setEditingDms] = useState(false);
  const [editingPhoneTree, setEditingPhoneTree] = useState(false);
  const [editingEscalation, setEditingEscalation] = useState(false);
  const [editingWarRoom, setEditingWarRoom] = useState(false);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSaveDms = () => {
    setEditingDms(false);
    onRefresh?.();
  };

  const handleAddPhoneContact = () => {
    if (!phoneForm.name || !phoneForm.phone) return;
    const newContact: PhoneTreeContact = {
      id: `pt-${Date.now()}`,
      name: phoneForm.name,
      role: phoneForm.role || 'Support',
      designation: 'Backup',
      phone: phoneForm.phone,
      email: phoneForm.email,
    };
    setPhoneTree(prev => [...prev, newContact]);
    setPhoneForm({ name: '', role: '', phone: '', email: '' });
    setShowPhoneForm(false);
    onRefresh?.();
  };

  const handleMoveContact = (index: number, direction: 'up' | 'down') => {
    const next = [...phoneTree];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= next.length) return;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setPhoneTree(next);
  };

  const handleToggleEscalationRule = (id: string) => {
    setEscalationRules(prev =>
      prev.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const handleAddEscalationRule = () => {
    if (!newRuleLabel.trim()) return;
    setEscalationRules(prev => [
      ...prev,
      { id: `er-${Date.now()}`, label: newRuleLabel.trim(), enabled: true },
    ]);
    setNewRuleLabel('');
    setShowRuleForm(false);
  };

  const handleToggleWarRoom = (id: string) => {
    setWarRoomDefaults(prev =>
      prev.map(d => (d.id === id ? { ...d, enabled: !d.enabled } : d)),
    );
  };
  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ================================================================ */}
      {/* 1. Dead Man's Switch                                             */}
      {/* ================================================================ */}
      <SectionCard title="Dead Man&#39;s Switch">
        <div className="space-y-4">
          {/* Enabled toggle */}
          <Toggle
            checked={dms.isEnabled}
            onChange={v => setDms(prev => ({ ...prev, isEnabled: v }))}
            label="Enabled"
          />

          {/* Interval & trigger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Check-in interval
              </label>
              <select
                value={dms.checkInIntervalHours}
                onChange={e => setDms(prev => ({ ...prev, checkInIntervalHours: Number(e.target.value) }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                {INTERVAL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Trigger after (missed check-ins)
              </label>
              <input
                type="number"
                min={1}
                value={dms.triggerAfterMisses}
                onChange={e => setDms(prev => ({ ...prev, triggerAfterMisses: Number(e.target.value) }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Protocol steps */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Protocol Steps ({dms.protocols.length})
            </h4>
            <div className="space-y-2">
              {dms.protocols.map((protocol: DeadManProtocol) => (
                <div
                  key={protocol.order}
                  className="flex items-center justify-between border border-gray-100 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-gray-50 dark:bg-gray-700/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-xs font-semibold text-blue-700 dark:text-blue-300">
                      {protocol.order}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Step {protocol.order}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      &rarr; {protocol.contactName}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    +{protocol.delayHoursAfterTrigger}h
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveDms}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-5 rounded-lg transition-colors focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none"
          >
            Save DMS Config
          </button>
        </div>
      </SectionCard>

      {/* ================================================================ */}
      {/* 2. Phone Tree                                                    */}
      {/* ================================================================ */}
      <SectionCard title="Phone Tree">
        <div className="space-y-4">
          {/* Contact list */}
          <div className="space-y-2">
            {phoneTree.map((contact, idx) => (
              <div
                key={contact.id}
                className="flex items-center justify-between border border-gray-100 dark:border-gray-600 rounded-lg px-4 py-3 bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {contact.name}
                      <span className="text-gray-400 dark:text-gray-500 mx-2">&mdash;</span>
                      <span className="text-gray-600 dark:text-gray-400">{contact.role}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{contact.phone}</div>
                  </div>
                </div>

                {reorderMode && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveContact(idx, 'up')}
                      className="p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      &#9650;
                    </button>
                    <button
                      type="button"
                      disabled={idx === phoneTree.length - 1}
                      onClick={() => handleMoveContact(idx, 'down')}
                      className="p-1 text-gray-500 hover:text-blue-600 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      &#9660;
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Inline add form */}
          {showPhoneForm && (
            <div className="border border-blue-200 dark:border-blue-700 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" placeholder="Name" value={phoneForm.name} onChange={e => setPhoneForm(prev => ({ ...prev, name: e.target.value }))} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 focus:outline-none" />
                <input type="text" placeholder="Role" value={phoneForm.role} onChange={e => setPhoneForm(prev => ({ ...prev, role: e.target.value }))} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 focus:outline-none" />
                <input type="tel" placeholder="Phone" value={phoneForm.phone} onChange={e => setPhoneForm(prev => ({ ...prev, phone: e.target.value }))} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 focus:outline-none" />
                <input type="email" placeholder="Email" value={phoneForm.email} onChange={e => setPhoneForm(prev => ({ ...prev, email: e.target.value }))} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleAddPhoneContact} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none">Add Contact</button>
                <button type="button" onClick={() => setShowPhoneForm(false)} className="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-sm font-medium py-2 px-4 rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setShowPhoneForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none">+ Add to phone tree</button>
            <button
              type="button"
              onClick={() => setReorderMode(prev => !prev)}
              className={`text-sm font-medium py-2 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none ${reorderMode ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'}`}
            >
              {reorderMode ? 'Done Reordering' : 'Reorder'}
            </button>
          </div>

          {/* VoiceForge toggle */}
          <Toggle
            checked={useVoiceForge}
            onChange={setUseVoiceForge}
            label="Use VoiceForge for automated calls"
          />
        </div>
      </SectionCard>

      {/* ================================================================ */}
      {/* 3. Escalation Rules                                              */}
      {/* ================================================================ */}
      <SectionCard title="Escalation Rules">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Auto-declare crisis when:
          </p>

          <div className="space-y-3">
            {escalationRules.map(rule => (
              <label key={rule.id} className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" checked={rule.enabled} onChange={() => handleToggleEscalationRule(rule.id)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">{rule.label}</span>
              </label>
            ))}
          </div>

          {/* Inline add rule form */}
          {showRuleForm && (
            <div className="border border-blue-200 dark:border-blue-700 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 space-y-3">
              <input type="text" placeholder="Describe the auto-escalation condition..." value={newRuleLabel} onChange={e => setNewRuleLabel(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 focus:outline-none" />
              <div className="flex gap-2">
                <button type="button" onClick={handleAddEscalationRule} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none">Add Rule</button>
                <button type="button" onClick={() => setShowRuleForm(false)} className="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-sm font-medium py-2 px-4 rounded-lg transition-colors">Cancel</button>
              </div>
            </div>
          )}

          <button type="button" onClick={() => setShowRuleForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none">+ Add auto-escalation rule</button>
        </div>
      </SectionCard>

      {/* ================================================================ */}
      {/* 4. War Room Defaults                                             */}
      {/* ================================================================ */}
      <SectionCard title="War Room Defaults">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            When War Room activates:
          </p>

          <div className="space-y-3">
            {warRoomDefaults.map(item => (
              <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" checked={item.enabled} onChange={() => handleToggleWarRoom(item.id)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
