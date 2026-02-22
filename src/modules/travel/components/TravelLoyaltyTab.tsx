'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LoyaltyProgram } from '../types';

interface TravelLoyaltyTabProps {
  entityId?: string;
}

interface LocalLoyaltyProgram {
  id: string;
  programName: string;
  accountNumber: string;
  statusTier: string;
  balance: number;
  balanceUnit: 'miles' | 'points';
  expiring: string | null;
  estimatedValue: number;
}

function toLoyaltyDisplay(p: LoyaltyProgram): LocalLoyaltyProgram {
  const expiringStr = p.expiringAmount && p.expiringDate
    ? `${p.expiringAmount.toLocaleString()} by ${new Date(p.expiringDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    : null;
  return {
    id: p.id,
    programName: p.programName,
    accountNumber: p.accountNumber,
    statusTier: p.tier || '\u2014',
    balance: p.balance,
    balanceUnit: p.unit,
    expiring: expiringStr,
    estimatedValue: p.estimatedValue,
  };
}

const DEMO_PROGRAMS: LocalLoyaltyProgram[] = [
  {
    id: 'l1',
    programName: 'Delta SkyMiles',
    accountNumber: '****7890',
    statusTier: 'Gold',
    balance: 45230,
    balanceUnit: 'miles',
    expiring: '5,000 by Dec 2026',
    estimatedValue: 542,
  },
  {
    id: 'l2',
    programName: 'Marriott Bonvoy',
    accountNumber: '****3210',
    statusTier: 'Platinum',
    balance: 82400,
    balanceUnit: 'points',
    expiring: null,
    estimatedValue: 658,
  },
  {
    id: 'l3',
    programName: 'Amex MR',
    accountNumber: '****4242',
    statusTier: '\u2014',
    balance: 125000,
    balanceUnit: 'points',
    expiring: null,
    estimatedValue: 1640,
  },
];

const STATUS_STYLES: Record<string, string> = {
  Gold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  Platinum: 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200',
  Silver: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  Diamond: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  '\u2014': 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

function getStatusStyle(tier: string): string {
  return STATUS_STYLES[tier] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
}

function formatBalance(balance: number): string {
  return balance.toLocaleString();
}

function formatUnit(unit: 'miles' | 'points'): string {
  return unit === 'miles' ? 'mi' : 'pts';
}

export default function TravelLoyaltyTab({ entityId }: TravelLoyaltyTabProps) {
  const [programs, setPrograms] = useState<LocalLoyaltyProgram[]>(DEMO_PROGRAMS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [newProgramName, setNewProgramName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newStatusTier, setNewStatusTier] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [newBalanceUnit, setNewBalanceUnit] = useState<'miles' | 'points'>('points');
  const [newExpiryTracking, setNewExpiryTracking] = useState(false);

  const expiringPrograms = programs.filter((p) => p.expiring);
  const totalEstimatedValue = programs.reduce((sum, p) => sum + p.estimatedValue, 0);

  const fetchPrograms = useCallback(async () => {
    try {
      const res = await fetch('/api/travel/loyalty');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setPrograms(json.data.map(toLoyaltyDisplay));
        }
      }
    } catch {
      // Fall back to demo data on error
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const handleAddProgram = async () => {
    if (!newProgramName.trim() || !newAccountNumber.trim()) return;
    setIsLoading(true);
    try {
      const balanceNum = parseInt(newBalance.replace(/,/g, ''), 10) || 0;
      const payload = {
        programName: newProgramName.trim(),
        accountNumber: newAccountNumber.trim(),
        tier: newStatusTier.trim() || '',
        balance: balanceNum,
        unit: newBalanceUnit,
        estimatedValue: 0,
        expiryTracking: newExpiryTracking,
      };

      const res = await fetch('/api/travel/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setPrograms((prev) => [...prev, toLoyaltyDisplay(json.data)]);
        }
      } else {
        // Fallback local add
        const program: LocalLoyaltyProgram = {
          id: crypto.randomUUID(),
          programName: newProgramName.trim(),
          accountNumber: newAccountNumber.trim(),
          statusTier: newStatusTier.trim() || '\u2014',
          balance: balanceNum,
          balanceUnit: newBalanceUnit,
          expiring: null,
          estimatedValue: 0,
        };
        console.log('Adding loyalty program for entity:', entityId, program);
        setPrograms((prev) => [...prev, program]);
      }

      resetForm();
    } catch {
      // Fallback local add on network error
      const program: LocalLoyaltyProgram = {
        id: crypto.randomUUID(),
        programName: newProgramName.trim(),
        accountNumber: newAccountNumber.trim(),
        statusTier: newStatusTier.trim() || '\u2014',
        balance: parseInt(newBalance.replace(/,/g, ''), 10) || 0,
        balanceUnit: newBalanceUnit,
        expiring: null,
        estimatedValue: 0,
      };
      setPrograms((prev) => [...prev, program]);
      resetForm();
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setNewProgramName('');
    setNewAccountNumber('');
    setNewStatusTier('');
    setNewBalance('');
    setNewBalanceUnit('points');
    setNewExpiryTracking(false);
    setShowAddForm(false);
  };

  const handleCancelAdd = () => {
    resetForm();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Loyalty Programs</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track your loyalty memberships, balances, and expiring rewards.</p>
        </div>
        <button type="button" onClick={() => setShowAddForm(true)} className="inline-flex items-center gap-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
          <span className="text-lg leading-none">+</span> Add Program
        </button>
      </div>

      {/* Expiry Warnings */}
      {expiringPrograms.length > 0 && (
        <div className="space-y-2">
          {expiringPrograms.map((program) => (
            <div key={`warning-${program.id}`} className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg px-4 py-3">
              <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">&#9888;</span>
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                <strong>{program.expiring?.split(' by ')[0]} {program.programName.split(' ').pop()}</strong>{' '}
                expiring {program.expiring?.split(' by ')[1] ?? ''}. Consider booking a short trip or transferring to hotel.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Programs Table or Empty State */}
      {programs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3 text-gray-300 dark:text-gray-600">&#9992;</div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            No loyalty programs tracked yet. Add your frequent flyer and hotel programs to monitor balances and expiring rewards.
          </p>
          <button type="button" onClick={() => setShowAddForm(true)} className="inline-flex items-center gap-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
            <span className="text-lg leading-none">+</span> Add Program
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 py-3">Program</th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 py-3">Number</th>
                  <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 py-3">Status/Tier</th>
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
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatBalance(program.balance)}</span>{' '}
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatUnit(program.balanceUnit)}</span>
                    </td>
                    <td className="px-6 py-4">
                      {program.expiring ? (
                        <span className="inline-flex items-center gap-1 text-sm text-yellow-700 dark:text-yellow-400 font-medium">
                          <span>&#9888;</span> {program.expiring}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total Estimated Value Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total estimated value</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">~${totalEstimatedValue.toLocaleString()}</span>
          </div>
        </div>
      )}

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
                Account Number <span className="text-red-500">*</span>
              </label>
              <input type="text" value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} placeholder="e.g., 1234567890" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Status Tier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status/Tier</label>
              <input type="text" value={newStatusTier} onChange={(e) => setNewStatusTier(e.target.value)} placeholder="e.g., Gold, Platinum" className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Balance + Unit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Balance</label>
              <div className="flex gap-2">
                <input type="text" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} placeholder="e.g., 50,000" className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                <select value={newBalanceUnit} onChange={(e) => setNewBalanceUnit(e.target.value as 'miles' | 'points')} className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="points">pts</option>
                  <option value="miles">miles</option>
                </select>
              </div>
            </div>
          </div>

          {/* Expiry Tracking */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={newExpiryTracking}
              onChange={(e) => setNewExpiryTracking(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Track expiring rewards for this program</span>
          </label>

          {/* Form Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleAddProgram} disabled={!newProgramName.trim() || !newAccountNumber.trim() || isLoading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white font-medium py-2 px-5 rounded-lg transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">
              {isLoading ? 'Adding...' : 'Add Program'}
            </button>
            <button type="button" onClick={handleCancelAdd} disabled={isLoading} className="px-5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
