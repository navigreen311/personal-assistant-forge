'use client';

import { useState } from 'react';

interface TravelLoyaltyTabProps {
  entityId?: string;
}

interface LoyaltyProgram {
  id: string;
  programName: string;
  accountNumber: string;
  statusTier: string;
  balance: string;
  balanceUnit: string;
  expiring: string | null;
}

const DEMO_PROGRAMS: LoyaltyProgram[] = [
  {
    id: '1',
    programName: 'Delta SkyMiles',
    accountNumber: '1234567890',
    statusTier: 'Gold',
    balance: '45,230',
    balanceUnit: 'miles',
    expiring: '5,000 by Dec 2026',
  },
  {
    id: '2',
    programName: 'Marriott Bonvoy',
    accountNumber: '9876543210',
    statusTier: 'Platinum',
    balance: '82,400',
    balanceUnit: 'pts',
    expiring: null,
  },
  {
    id: '3',
    programName: 'Amex MR',
    accountNumber: '****4242',
    statusTier: '—',
    balance: '125,000',
    balanceUnit: 'pts',
    expiring: null,
  },
];

const STATUS_STYLES: Record<string, string> = {
  Gold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  Platinum: 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200',
  Silver: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  Diamond: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  '—': 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

function getStatusStyle(tier: string): string {
  return STATUS_STYLES[tier] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
}

export default function TravelLoyaltyTab({ entityId }: TravelLoyaltyTabProps) {
  const [programs, setPrograms] = useState<LoyaltyProgram[]>(DEMO_PROGRAMS);
  const [showAddForm, setShowAddForm] = useState(false);

  const [newProgramName, setNewProgramName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newStatusTier, setNewStatusTier] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newBalanceUnit, setNewBalanceUnit] = useState('pts');
  const [newNotes, setNewNotes] = useState('');

  const expiringPrograms = programs.filter((p) => p.expiring);

  const handleAddProgram = () => {
    if (!newProgramName.trim() || !newAccountNumber.trim()) return;
    const program: LoyaltyProgram = {
      id: crypto.randomUUID(),
      programName: newProgramName.trim(),
      accountNumber: newAccountNumber.trim(),
      statusTier: newStatusTier.trim() || '—',
      balance: newBalance.trim() || '0',
      balanceUnit: newBalanceUnit,
      expiring: null,
    };
    console.log('Adding loyalty program for entity:', entityId, { ...program, notes: newNotes });
    setPrograms((prev) => [...prev, program]);
    setNewProgramName('');
    setNewAccountNumber('');
    setNewStatusTier('');
    setNewBalance('');
    setNewBalanceUnit('pts');
    setNewNotes('');
    setShowAddForm(false);
  };

  const handleCancelAdd = () => {
    setNewProgramName('');
    setNewAccountNumber('');
    setNewStatusTier('');
    setNewBalance('');
    setNewBalanceUnit('pts');
    setNewNotes('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Loyalty Programs</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track your loyalty memberships, balances, and expiring rewards.</p>
        </div>
        <button type="button" onClick={() => setShowAddForm(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
          <span className="text-lg leading-none">+</span> Add Loyalty Program
        </button>
      </div>

      {/* Expiry Warnings */}
      {expiringPrograms.length > 0 && (
        <div className="space-y-2">
          {expiringPrograms.map((program) => (
            <div key={`warning-${program.id}`} className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg px-4 py-3">
              <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">⚠️</span>
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                <strong>{program.expiring?.split(' by ')[0]} {program.programName.split(' ').pop()}</strong>{' '}
                expiring {program.expiring?.split(' by ')[1] ?? ''} — consider booking to preserve.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Programs Table */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 py-3">Program</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 py-3">Number</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 py-3">Balance</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 py-3">Expiring</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {programs.map((program) => (
                <tr key={program.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{program.programName}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600 dark:text-gray-300 font-mono">{program.accountNumber}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(program.statusTier)}`}>
                      {program.statusTier}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{program.balance}</span>{' '}
                    <span className="text-xs text-gray-500 dark:text-gray-400">{program.balanceUnit}</span>
                  </td>
                  <td className="px-6 py-4">
                    {program.expiring ? (
                      <span className="inline-flex items-center gap-1 text-sm text-yellow-700 dark:text-yellow-400 font-medium">
                        <span>⚠️</span> {program.expiring}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-gray-500">None</span>
                    )}
                  </td>
                </tr>
              ))}
              {programs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No loyalty programs added yet. Click &quot;+ Add Loyalty Program&quot; to get started.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Program Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Add Loyalty Program</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Program Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Program Name <span className="text-red-500">*</span>
              </label>
              <input type="text" value={newProgramName} onChange={(e) => setNewProgramName(e.target.value)} placeholder="e.g., Delta SkyMiles" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Account Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Account # <span className="text-red-500">*</span>
              </label>
              <input type="text" value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} placeholder="e.g., 1234567890" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Status Tier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status Tier</label>
              <input type="text" value={newStatusTier} onChange={(e) => setNewStatusTier(e.target.value)} placeholder="e.g., Gold, Platinum" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Balance */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Balance</label>
              <div className="flex gap-2">
                <input type="text" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} placeholder="e.g., 50,000" className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <select value={newBalanceUnit} onChange={(e) => setNewBalanceUnit(e.target.value)} className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="pts">pts</option>
                  <option value="miles">miles</option>
                  <option value="nights">nights</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Any additional notes about this program..." rows={2} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" />
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleAddProgram} disabled={!newProgramName.trim() || !newAccountNumber.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white font-medium py-2 px-5 rounded-lg transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
              Add Program
            </button>
            <button type="button" onClick={handleCancelAdd} className="px-5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
