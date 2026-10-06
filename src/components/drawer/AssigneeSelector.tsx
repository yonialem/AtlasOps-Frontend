/**
 * ============================================================================
 * AtlasOps Incident Management Console - Assignee Selector Component
 * ============================================================================
 * File: src/components/drawer/AssigneeSelector.tsx
 * Operator reassignment control supporting user selection from catalog,
 * unassign capability, avatar indicator, and in-flight mutation locking.
 */

import { UserX, RefreshCw } from "lucide-react";
import { UserSummary } from "../../contracts/incident.types.ts";

export interface AssigneeSelectorProps {
  currentAssignee: UserSummary | null;
  users: readonly UserSummary[];
  onAssign: (userId: string | null) => void;
  isPending?: boolean;
  disabled?: boolean;
}

export function AssigneeSelector({
  currentAssignee,
  users,
  onAssign,
  isPending = false,
  disabled = false,
}: AssigneeSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onAssign(value === "" ? null : value);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor="assignee-select"
          className="text-xs font-semibold text-txt-secondary uppercase tracking-wider"
        >
          Assignee
        </label>
        {isPending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 font-mono">
            <RefreshCw
              className="w-3.5 h-3.5 animate-spin shrink-0"
              data-testid="assignee-spinner"
              aria-hidden="true"
            />
            <span>Reassigning...</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-elevated/50 border border-border-subtle">
        {/* Current Assignee Avatar Preview */}
        <div className="shrink-0">
          {currentAssignee ? (
            currentAssignee.avatarUrl ? (
              <img
                src={currentAssignee.avatarUrl}
                alt={currentAssignee.name}
                className="w-8 h-8 rounded-full border border-border-subtle object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-900 border border-blue-700 text-blue-200 font-mono text-xs font-bold flex items-center justify-center">
                {getInitials(currentAssignee.name)}
              </div>
            )
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center">
              <UserX className="w-4 h-4" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Current Assignee Info & Native Accessible Select */}
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="truncate">
            <div className="text-xs font-medium text-txt-primary truncate">
              {currentAssignee ? currentAssignee.name : "Unassigned"}
            </div>
            {currentAssignee?.email && (
              <div className="text-[11px] text-txt-secondary truncate font-mono">
                {currentAssignee.email}
              </div>
            )}
          </div>

          <div className="relative shrink-0">
            <select
              id="assignee-select"
              aria-label="Assignee"
              value={currentAssignee?.id ?? ""}
              onChange={handleChange}
              disabled={disabled || isPending}
              className="w-full sm:w-auto bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs font-medium text-txt-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <option value="">Unassign</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AssigneeSelector;
