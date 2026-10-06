/**
 * ============================================================================
 * AtlasOps Incident Management Console - Drawer Header Component
 * ============================================================================
 * File: src/components/drawer/DrawerHeader.tsx
 * Top header for IncidentDrawer displaying monospace ID, severity badge,
 * status badge, dismiss close button, and high-contrast title.
 */

import { X } from "lucide-react";
import { Incident } from "../../contracts/incident.types.ts";
import { StatusBadge } from "../incidents/StatusBadge.tsx";
import { SeverityBadge } from "../incidents/SeverityBadge.tsx";

export interface DrawerHeaderProps {
  incident: Incident;
  onClose: () => void;
}

export function DrawerHeader({ incident, onClose }: DrawerHeaderProps) {
  return (
    <div className="border-b border-border-subtle p-5 bg-surface-elevated/40 shrink-0">
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-mono text-sm font-bold tracking-tight text-txt-primary bg-surface px-2.5 py-1 rounded-md border border-border-subtle">
            {incident.id}
          </span>
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close incident details"
          title="Close incident details"
          className="inline-flex items-center justify-center p-2 rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <X className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="sr-only">×</span>
        </button>
      </div>

      {/* High-Contrast Title */}
      <h2
        id="drawer-title"
        className="mt-3 text-lg sm:text-xl font-bold text-txt-primary tracking-tight leading-snug break-words"
      >
        {incident.title}
      </h2>
    </div>
  );
}

export default DrawerHeader;
