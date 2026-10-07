/**
 * ============================================================================
 * AtlasOps Incident Management Console - Incident Table Component
 * ============================================================================
 * File: src/components/incidents/IncidentTable.tsx
 * Data-dense semantic table for desktop viewports (>= 768px).
 * Supports sortable column headers with aria-sort, keyboard navigation,
 * and high-contrast row selection.
 */

import { ArrowUpDown } from "lucide-react";
import { Incident } from "../../contracts/incident.types.ts";
import { IncidentSortField, SortOrder } from "../../contracts/api.types.ts";
import { SeverityBadge } from "./SeverityBadge.tsx";
import { StatusBadge } from "./StatusBadge.tsx";
import { formatRelativeTime } from "./timeUtils.ts";

export interface IncidentTableProps {
  incidents: Incident[];
  sort?: IncidentSortField;
  order?: SortOrder;
  onSortChange?: (field: IncidentSortField) => void;
  onSelectIncident?: (id: string) => void;
  selectedIncidentId?: string | null;
  className?: string;
}

export function IncidentTable({
  incidents,
  sort = "updatedAt",
  order = "desc",
  onSortChange,
  onSelectIncident,
  selectedIncidentId,
  className = "",
}: IncidentTableProps) {
  const renderSortIndicator = (field: IncidentSortField) => {
    if (sort !== field) {
      return (
        <ArrowUpDown
          className="w-3.5 h-3.5 text-txt-muted group-hover:text-txt-secondary ml-1"
          aria-hidden={true}
        />
      );
    }
    return order === "asc" ? (
      <span className="inline-flex items-center ml-1 text-blue-400" aria-hidden={true}>
        ▲
      </span>
    ) : (
      <span className="inline-flex items-center ml-1 text-blue-400" aria-hidden={true}>
        ▼
      </span>
    );
  };

  const getAriaSort = (field: IncidentSortField): "ascending" | "descending" | "none" => {
    if (sort !== field) return "none";
    return order === "asc" ? "ascending" : "descending";
  };

  return (
    <div className={`overflow-x-auto rounded-lg border border-border-subtle bg-surface ${className}`}>
      <table className="w-full text-left border-collapse text-xs" aria-label="Incidents table">
        <thead className="bg-slate-800 text-slate-300 border-b border-border-subtle sticky top-0 z-10 select-none">
          <tr>
            <th scope="col" className="py-3 px-4 font-semibold text-slate-300 w-28">
              ID
            </th>
            <th scope="col" className="py-3 px-4 font-semibold text-slate-300 min-w-[240px]">
              Title
            </th>
            <th scope="col" className="py-3 px-4 font-semibold text-slate-300 w-36">
              Status
            </th>
            <th
              scope="col"
              aria-sort={getAriaSort("severity")}
              className="py-3 px-4 font-semibold text-slate-300 w-32"
            >
              <button
                type="button"
                onClick={() => onSortChange?.("severity")}
                className="group inline-flex items-center gap-1 font-semibold hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 -mx-1"
              >
                <span>Severity</span>
                {renderSortIndicator("severity")}
              </button>
            </th>
            <th scope="col" className="py-3 px-4 font-semibold text-slate-300 w-36">
              Service
            </th>
            <th scope="col" className="py-3 px-4 font-semibold text-slate-300 w-44">
              Assignee
            </th>
            <th
              scope="col"
              aria-sort={getAriaSort("updatedAt")}
              className="py-3 px-4 font-semibold text-slate-300 w-36"
            >
              <button
                type="button"
                onClick={() => onSortChange?.("updatedAt")}
                className="group inline-flex items-center gap-1 font-semibold hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 -mx-1"
              >
                <span>Last Updated</span>
                {renderSortIndicator("updatedAt")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle/50">
          {incidents.map((incident) => {
            const isSelected = selectedIncidentId === incident.id;
            const relativeTime = formatRelativeTime(incident.updatedAt);

            return (
              <tr
                key={incident.id}
                tabIndex={0}
                role="row"
                onClick={() => onSelectIncident?.(incident.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectIncident?.(incident.id);
                  } else if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") {
                    e.preventDefault();
                    const nextRow = e.currentTarget.nextElementSibling as HTMLElement | null;
                    nextRow?.focus();
                  } else if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") {
                    e.preventDefault();
                    const prevRow = e.currentTarget.previousElementSibling as HTMLElement | null;
                    prevRow?.focus();
                  }
                }}
                className={`cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
                  isSelected
                    ? "bg-blue-950/40 border-l-4 border-l-blue-500 text-txt-primary"
                    : "hover:bg-slate-800/60 text-txt-secondary hover:text-txt-primary"
                }`}
                aria-selected={isSelected}
                data-incident-id={incident.id}
              >
                {/* ID Column */}
                <td className="py-3 px-4 font-mono font-medium text-txt-primary whitespace-nowrap">
                  {incident.id}
                </td>

                {/* Title Column */}
                <td className="py-3 px-4 max-w-md">
                  <div
                    className="font-medium text-txt-primary line-clamp-2"
                    title={incident.title}
                  >
                    {incident.title}
                  </div>
                </td>

                {/* Status Column */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <StatusBadge status={incident.status} />
                </td>

                {/* Severity Column */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <SeverityBadge severity={incident.severity} />
                </td>

                {/* Service Column */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-surface-elevated text-slate-300 border border-slate-700">
                    {incident.service}
                  </span>
                </td>

                {/* Assignee Column */}
                <td className="py-3 px-4 whitespace-nowrap">
                  {incident.assignee ? (
                    <div className="flex items-center gap-2">
                      {incident.assignee.avatarUrl ? (
                        <img
                          src={incident.assignee.avatarUrl}
                          alt={incident.assignee.name}
                          className="w-5 h-5 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                          {incident.assignee.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate max-w-[120px]" title={incident.assignee.name}>
                        {incident.assignee.name}
                      </span>
                    </div>
                  ) : (
                    <span className="text-txt-muted italic">Unassigned</span>
                  )}
                </td>

                {/* Last Updated Column */}
                <td
                  className="py-3 px-4 whitespace-nowrap text-txt-muted font-mono"
                  title={incident.updatedAt}
                >
                  {relativeTime}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default IncidentTable;
