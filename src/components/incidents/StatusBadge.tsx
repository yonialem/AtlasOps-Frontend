/**
 * ============================================================================
 * AtlasOps Incident Management Console - Status Badge Component
 * ============================================================================
 * File: src/components/incidents/StatusBadge.tsx
 * Multi-modal visual indicator for incident lifecycle status states.
 * Supports optimistic pending micro-spinner.
 */

import { Eye, Activity, CheckCircle2, RefreshCw, LucideIcon } from "lucide-react";
import { IncidentStatus } from "../../contracts/incident.types.ts";

export interface StatusBadgeProps {
  status: IncidentStatus;
  isOptimisticPending?: boolean;
  className?: string;
}

interface StatusConfig {
  label: string;
  Icon?: LucideIcon;
  containerClasses: string;
  dotColor?: string;
}

const STATUS_CONFIG: Record<IncidentStatus, StatusConfig> = {
  triggered: {
    label: "Triggered",
    containerClasses:
      "bg-red-950/60 border-red-700/60 text-red-300 selection:bg-red-900",
    dotColor: "bg-red-500",
  },
  acknowledged: {
    label: "Acknowledged",
    Icon: Eye,
    containerClasses:
      "bg-blue-950/60 border-blue-700/60 text-blue-300 selection:bg-blue-900",
  },
  investigating: {
    label: "Investigating",
    Icon: Activity,
    containerClasses:
      "bg-purple-950/60 border-purple-700/60 text-purple-300 selection:bg-purple-900",
  },
  resolved: {
    label: "Resolved",
    Icon: CheckCircle2,
    containerClasses:
      "bg-emerald-950/60 border-emerald-700/60 text-emerald-300 selection:bg-emerald-900",
  },
};

export function StatusBadge({
  status,
  isOptimisticPending = false,
  className = "",
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.triggered;
  const { label, Icon, containerClasses, dotColor } = config;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${containerClasses} ${className}`}
      aria-label={`Status: ${label}`}
      data-status={status}
    >
      {isOptimisticPending ? (
        <RefreshCw
          className="w-3 h-3 animate-spin shrink-0 text-current"
          aria-hidden={true}
          data-testid="optimistic-spinner"
        />
      ) : dotColor ? (
        <span
          className={`h-2 w-2 rounded-full shrink-0 animate-pulse ${dotColor}`}
          aria-hidden={true}
        />
      ) : Icon ? (
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden={true} />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

export default StatusBadge;
