/**
 * ============================================================================
 * AtlasOps Incident Management Console - Status Transition Control
 * ============================================================================
 * File: src/components/drawer/StatusTransitionControl.tsx
 * Interactive lifecycle transition buttons enforcing ALLOWED_STATUS_TRANSITIONS
 * state machine with optimistic pending spinner and button locking.
 */

import { RefreshCw } from "lucide-react";
import {
  IncidentStatus,
  ALLOWED_STATUS_TRANSITIONS,
} from "../../contracts/incident.types.ts";

export interface StatusTransitionControlProps {
  currentStatus: IncidentStatus;
  onTransition: (targetStatus: IncidentStatus) => void;
  isPending?: boolean;
  disabled?: boolean;
}

const STATUS_LABELS: Record<IncidentStatus, string> = {
  triggered: "Triggered",
  acknowledged: "Acknowledged",
  investigating: "Investigating",
  resolved: "Resolved",
};

const BUTTON_CLASSES: Record<IncidentStatus, string> = {
  triggered:
    "bg-red-950/60 border-red-700/60 text-red-200 hover:bg-red-900/80 focus:ring-red-500",
  acknowledged:
    "bg-blue-950/60 border-blue-700/60 text-blue-200 hover:bg-blue-900/80 focus:ring-blue-500",
  investigating:
    "bg-purple-950/60 border-purple-700/60 text-purple-200 hover:bg-purple-900/80 focus:ring-purple-500",
  resolved:
    "bg-emerald-950/60 border-emerald-700/60 text-emerald-200 hover:bg-emerald-900/80 focus:ring-emerald-500",
};

export function StatusTransitionControl({
  currentStatus,
  onTransition,
  isPending = false,
  disabled = false,
}: StatusTransitionControlProps) {
  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
          Status Transition
        </label>
        {isPending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 font-mono">
            <RefreshCw
              className="w-3.5 h-3.5 animate-spin shrink-0"
              data-testid="optimistic-spinner"
              aria-hidden="true"
            />
            <span>Updating...</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {allowedTransitions.length === 0 ? (
          <span className="text-xs text-txt-muted italic">
            No further transitions permitted from current status.
          </span>
        ) : (
          allowedTransitions.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onTransition(target)}
              disabled={disabled || isPending}
              data-status={target}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_CLASSES[target]}`}
            >
              {isPending && (
                <RefreshCw
                  className="w-3 h-3 animate-spin shrink-0"
                  aria-hidden="true"
                />
              )}
              <span>{STATUS_LABELS[target]}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default StatusTransitionControl;
