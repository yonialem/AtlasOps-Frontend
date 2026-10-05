/**
 * ============================================================================
 * AtlasOps Incident Management Console - Severity Badge Component
 * ============================================================================
 * File: src/components/incidents/SeverityBadge.tsx
 * Multi-modal visual indicator for operational severity levels.
 * Conforms strictly to WCAG 2.1 AA (never relies on color alone).
 */

import { Flame, AlertTriangle, AlertCircle, Shield, LucideIcon } from "lucide-react";
import { IncidentSeverity } from "../../contracts/incident.types.ts";

export interface SeverityBadgeProps {
  severity: IncidentSeverity;
  className?: string;
}

interface SeverityConfig {
  label: string;
  Icon: LucideIcon;
  containerClasses: string;
}

const SEVERITY_CONFIG: Record<IncidentSeverity, SeverityConfig> = {
  critical: {
    label: "CRITICAL",
    Icon: Flame,
    containerClasses:
      "bg-red-950/80 border-red-600 text-red-200 selection:bg-red-800",
  },
  high: {
    label: "HIGH",
    Icon: AlertTriangle,
    containerClasses:
      "bg-orange-950/80 border-orange-600 text-orange-200 selection:bg-orange-800",
  },
  medium: {
    label: "MEDIUM",
    Icon: AlertCircle,
    containerClasses:
      "bg-amber-950/80 border-amber-600 text-amber-200 selection:bg-amber-800",
  },
  low: {
    label: "LOW",
    Icon: Shield,
    containerClasses:
      "bg-slate-800 border-slate-500 text-slate-200 selection:bg-slate-700",
  },
};

export function SeverityBadge({ severity, className = "" }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.low;
  const { label, Icon, containerClasses } = config;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-semibold border ${containerClasses} ${className}`}
      aria-label={`Severity: ${label}`}
      data-severity={severity}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden={true} />
      <span>{label}</span>
    </span>
  );
}

export default SeverityBadge;
