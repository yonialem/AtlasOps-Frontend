/**
 * ============================================================================
 * AtlasOps Incident Management Console - Incident Card Component
 * ============================================================================
 * File: src/components/incidents/IncidentCard.tsx
 * High-density touch-friendly card representation for mobile viewports (< 768px).
 * Enforces >= 44x44px interactive target ergonomics.
 */

import { Incident } from "../../contracts/incident.types.ts";
import { SeverityBadge } from "./SeverityBadge.tsx";
import { StatusBadge } from "./StatusBadge.tsx";
import { formatRelativeTime } from "./timeUtils.ts";

export interface IncidentCardProps {
  incident: Incident;
  onSelectIncident?: (id: string) => void;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
  className?: string;
}

export function IncidentCard({
  incident,
  onSelectIncident,
  onSelect,
  isSelected = false,
  className = "",
}: IncidentCardProps) {
  const handleClick = () => {
    if (onSelectIncident) {
      onSelectIncident(incident.id);
    } else if (onSelect) {
      onSelect(incident.id);
    }
  };

  const relativeTime = formatRelativeTime(incident.updatedAt);

  return (
    <article
      tabIndex={0}
      role="button"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`border rounded-lg p-4 mb-3 transition-colors cursor-pointer min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isSelected
          ? "border-blue-500 bg-slate-800 ring-1 ring-blue-500"
          : "border-slate-700 bg-slate-800/90 hover:bg-slate-800 hover:border-slate-600"
      } ${className}`}
      aria-selected={isSelected}
      data-incident-id={incident.id}
    >
      {/* Top Row: ID + Badges */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-bold text-blue-400">
          {incident.id}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>
      </div>

      {/* Middle Row: Title */}
      <h3
        className="font-semibold text-sm text-txt-primary line-clamp-2 mb-3 leading-snug"
        title={incident.title}
      >
        {incident.title}
      </h3>

      {/* Bottom Row: Service Chip, Assignee, and Timestamp */}
      <div className="flex items-center justify-between gap-2 text-xs text-txt-secondary border-t border-slate-700/60 pt-2.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-elevated text-slate-300 border border-slate-700">
            {incident.service}
          </span>
          <span className="truncate max-w-[120px]">
            {incident.assignee ? (
              <span className="text-slate-300">{incident.assignee.name}</span>
            ) : (
              <span className="text-txt-muted italic">Unassigned</span>
            )}
          </span>
        </div>

        <time
          dateTime={incident.updatedAt}
          className="text-txt-muted font-mono text-[11px] shrink-0"
          title={incident.updatedAt}
        >
          {relativeTime}
        </time>
      </div>
    </article>
  );
}

export default IncidentCard;
