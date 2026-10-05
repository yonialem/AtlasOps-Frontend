/**
 * ============================================================================
 * AtlasOps Incident Management Console - Incident List Container
 * ============================================================================
 * File: src/components/incidents/IncidentList.tsx
 * Responsive incident container switching between desktop table and mobile cards.
 * Provides animated shimmer loading skeletons and distinct empty states.
 */

import { SearchX, CheckCircle2 } from "lucide-react";
import { Incident } from "../../contracts/incident.types.ts";
import { IncidentSortField, SortOrder } from "../../contracts/api.types.ts";
import { IncidentTable } from "./IncidentTable.tsx";
import { IncidentCard } from "./IncidentCard.tsx";

export interface IncidentListProps {
  incidents: Incident[];
  isLoading?: boolean;
  sort?: IncidentSortField;
  order?: SortOrder;
  onSortChange?: (field: IncidentSortField) => void;
  onSelectIncident?: (id: string) => void;
  selectedIncidentId?: string | null;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export function IncidentList({
  incidents,
  isLoading = false,
  sort = "updatedAt",
  order = "desc",
  onSortChange,
  onSelectIncident,
  selectedIncidentId,
  onClearFilters,
  hasActiveFilters = false,
  className = "",
}: IncidentListProps) {
  // Loading Skeleton State
  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`} aria-busy="true" aria-label="Loading incidents">
        {/* Desktop Skeleton Table */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-border-subtle bg-surface">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-800 text-slate-300 border-b border-border-subtle">
              <tr>
                <th className="py-3 px-4 w-28">ID</th>
                <th className="py-3 px-4 min-w-[240px]">Title</th>
                <th className="py-3 px-4 w-36">Status</th>
                <th className="py-3 px-4 w-32">Severity</th>
                <th className="py-3 px-4 w-36">Service</th>
                <th className="py-3 px-4 w-44">Assignee</th>
                <th className="py-3 px-4 w-36">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50">
              {[...Array(5)].map((_, idx) => (
                <tr key={idx} className="animate-pulse" data-testid="table-skeleton-row">
                  <td className="py-3 px-4">
                    <div className="h-4 w-16 bg-slate-700/50 rounded" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-3/4 bg-slate-700/50 rounded" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-5 w-24 bg-slate-700/50 rounded-full" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-5 w-20 bg-slate-700/50 rounded" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-24 bg-slate-700/50 rounded" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-28 bg-slate-700/50 rounded" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="h-4 w-16 bg-slate-700/50 rounded" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Skeleton Cards */}
        <div className="block md:hidden">
          {[...Array(5)].map((_, idx) => (
            <div
              key={idx}
              className="border border-slate-700 bg-slate-800/90 rounded-lg p-4 mb-3 animate-pulse"
              data-testid="card-skeleton"
            >
              <div className="flex justify-between items-center mb-2">
                <div className="h-4 w-20 bg-slate-700/50 rounded" />
                <div className="h-5 w-28 bg-slate-700/50 rounded-full" />
              </div>
              <div className="h-4 w-5/6 bg-slate-700/50 rounded mb-3" />
              <div className="flex justify-between items-center border-t border-slate-700/60 pt-2.5">
                <div className="h-4 w-24 bg-slate-700/50 rounded" />
                <div className="h-4 w-16 bg-slate-700/50 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty State: No incidents
  if (incidents.length === 0) {
    if (hasActiveFilters) {
      return (
        <div
          className={`p-12 text-center rounded-lg border border-border-subtle bg-surface flex flex-col items-center justify-center ${className}`}
          role="status"
        >
          <div className="p-3 bg-slate-800 rounded-full text-slate-400 mb-3">
            <SearchX className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-txt-primary mb-1">
            No matching incidents found
          </h3>
          <p className="text-sm text-txt-secondary max-w-sm mb-4">
            No incidents matched your query and active filters.
          </p>
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Clear All Filters
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        className={`p-12 text-center rounded-lg border border-border-subtle bg-surface flex flex-col items-center justify-center ${className}`}
        role="status"
      >
        <div className="p-3 bg-emerald-950/60 border border-emerald-700/50 rounded-full text-emerald-400 mb-3">
          <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-txt-primary mb-1">
          No incidents recorded
        </h3>
        <p className="text-sm text-txt-secondary max-w-sm">
          All monitored services are operating normally.
        </p>
      </div>
    );
  }

  // Active Incidents View: Responsive Desktop Table & Mobile Cards
  return (
    <div className={className}>
      {/* Desktop View (>= 768px) */}
      <div className="hidden md:block">
        <IncidentTable
          incidents={incidents}
          sort={sort}
          order={order}
          onSortChange={onSortChange}
          onSelectIncident={onSelectIncident}
          selectedIncidentId={selectedIncidentId}
        />
      </div>

      {/* Mobile View (< 768px) */}
      <div className="block md:hidden">
        {incidents.map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            onSelectIncident={onSelectIncident}
            isSelected={selectedIncidentId === incident.id}
          />
        ))}
      </div>
    </div>
  );
}

export default IncidentList;
