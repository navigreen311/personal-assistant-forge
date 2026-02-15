'use client';

import type { ExecutiveViewData } from '../entity.types';
import { EntityHealthBadge } from './EntityHealthBadge';

interface ExecutiveDashboardProps {
  data: ExecutiveViewData;
  onEntityClick?: (entityId: string) => void;
}

export function ExecutiveDashboard({
  data,
  onEntityClick,
}: ExecutiveDashboardProps) {
  const { aggregated, entities, crossEntityInsights } = data;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          label="Total Revenue"
          value={formatCurrency(aggregated.totalRevenue)}
          accent="text-green-600"
        />
        <SummaryCard
          label="Total Expenses"
          value={formatCurrency(aggregated.totalExpenses)}
          accent="text-red-600"
        />
        <SummaryCard
          label="Net Cash Flow"
          value={formatCurrency(aggregated.netCashFlow)}
          accent={aggregated.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}
        />
        <SummaryCard
          label="Critical Alerts"
          value={String(aggregated.criticalAlerts.length)}
          accent={
            aggregated.criticalAlerts.length > 0
              ? 'text-red-600'
              : 'text-green-600'
          }
        />
      </div>

      {/* Task & Message Overview */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Open Tasks"
          value={aggregated.totalOpenTasks}
          sub={`${aggregated.totalOverdueTasks} overdue`}
          warn={aggregated.totalOverdueTasks > 0}
        />
        <StatCard
          label="Pending Messages"
          value={aggregated.totalPendingMessages}
        />
        <StatCard
          label="Entities"
          value={entities.length}
        />
      </div>

      {/* Entity Health Grid */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Entity Health
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity) => (
            <div
              key={entity.entityId}
              onClick={() => onEntityClick?.(entity.entityId)}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEntityClick?.(entity.entityId);
                }
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {entity.entityName}
                </h3>
                <EntityHealthBadge health={entity.overallHealth} showLabel />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <div className="font-semibold text-gray-900">
                    {entity.metrics.openTasks}
                  </div>
                  <div className="text-gray-500">Tasks</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">
                    {entity.metrics.activeProjects}
                  </div>
                  <div className="text-gray-500">Projects</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">
                    {formatCurrency(entity.metrics.totalRevenue)}
                  </div>
                  <div className="text-gray-500">Revenue</div>
                </div>
              </div>
              {entity.alerts.length > 0 && (
                <div className="mt-3 text-xs text-amber-600">
                  {entity.alerts.length} alert{entity.alerts.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Cross-Entity Timeline */}
      {crossEntityInsights.upcomingDeadlines.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Upcoming Deadlines
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Entity
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Item
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Due Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {crossEntityInsights.upcomingDeadlines.slice(0, 10).map((d, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-4 py-2 text-gray-900">{d.entityName}</td>
                    <td className="px-4 py-2 text-gray-700">{d.item}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(d.dueDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Shared Vendors */}
      {crossEntityInsights.sharedVendors.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Shared Vendors
          </h2>
          <div className="flex flex-wrap gap-2">
            {crossEntityInsights.sharedVendors.map((sv) => (
              <span
                key={sv.vendor}
                className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
              >
                {sv.vendor}{' '}
                <span className="text-blue-400">
                  ({sv.entities.length} entities)
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Resource Conflicts */}
      {crossEntityInsights.resourceConflicts.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Resource Conflicts
          </h2>
          <div className="space-y-2">
            {crossEntityInsights.resourceConflicts.map((conflict, i) => (
              <div
                key={i}
                className={`rounded-lg border p-3 ${
                  conflict.severity === 'HIGH'
                    ? 'border-red-200 bg-red-50'
                    : conflict.severity === 'MEDIUM'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      conflict.severity === 'HIGH'
                        ? 'bg-red-100 text-red-700'
                        : conflict.severity === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {conflict.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-500">{conflict.severity}</span>
                </div>
                <p className="text-sm text-gray-700">{conflict.description}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {conflict.suggestedResolution}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: number;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && (
        <div className={`text-xs mt-1 ${warn ? 'text-amber-600' : 'text-gray-500'}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
