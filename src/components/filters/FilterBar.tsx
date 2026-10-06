/**
 * ============================================================================
 * AtlasOps Incident Management Console - FilterBar Component
 * ============================================================================
 * File: src/components/filters/FilterBar.tsx
 * Composite search and filter toolbar coordinating SearchInput, Status, Severity,
 * and Service multi-select dropdowns, and ActiveFilterChips.
 * Enforces the Page Reset Invariant (page: 1) upon any filter or search update.
 */

import { useMemo } from "react";
import { useUrlState, UrlState, UseUrlStateReturn } from "../../hooks/useUrlState.ts";
import { IncidentStatus, IncidentSeverity } from "../../contracts/incident.types.ts";
import { StatusBadge } from "../incidents/StatusBadge.tsx";
import { SeverityBadge } from "../incidents/SeverityBadge.tsx";
import { SearchInput } from "./SearchInput.tsx";
import { MultiSelectDropdown, DropdownOption } from "./MultiSelectDropdown.tsx";
import { ActiveFilterChips, FilterChip } from "./ActiveFilterChips.tsx";

export interface FilterBarProps {
  availableServices?: string[];
  isLoading?: boolean;
  className?: string;
  urlState?: UrlState;
  setUrlState?: UseUrlStateReturn["setUrlState"];
}

const STATUS_OPTIONS: readonly DropdownOption<IncidentStatus>[] = [
  {
    value: "triggered",
    label: "Triggered",
    badge: <StatusBadge status="triggered" />,
  },
  {
    value: "acknowledged",
    label: "Acknowledged",
    badge: <StatusBadge status="acknowledged" />,
  },
  {
    value: "investigating",
    label: "Investigating",
    badge: <StatusBadge status="investigating" />,
  },
  {
    value: "resolved",
    label: "Resolved",
    badge: <StatusBadge status="resolved" />,
  },
];

const SEVERITY_OPTIONS: readonly DropdownOption<IncidentSeverity>[] = [
  {
    value: "critical",
    label: "Critical",
    badge: <SeverityBadge severity="critical" />,
  },
  {
    value: "high",
    label: "High",
    badge: <SeverityBadge severity="high" />,
  },
  {
    value: "medium",
    label: "Medium",
    badge: <SeverityBadge severity="medium" />,
  },
  {
    value: "low",
    label: "Low",
    badge: <SeverityBadge severity="low" />,
  },
];

export function FilterBar({
  availableServices = [],
  className = "",
  urlState: propUrlState,
  setUrlState: propSetUrlState,
}: FilterBarProps) {
  const hookState = useUrlState();
  const urlState = propUrlState ?? hookState.state;
  const setUrlState = propSetUrlState ?? hookState.setUrlState;

  // Dynamic Service Dropdown Options from availableServices combined with current URL state
  const serviceOptions = useMemo<readonly DropdownOption<string>[]>(() => {
    const set = new Set<string>();
    if (availableServices) {
      for (const s of availableServices) {
        if (s && s.trim()) set.add(s.trim());
      }
    }
    for (const s of urlState.service) {
      if (s && s.trim()) set.add(s.trim());
    }
    return Array.from(set).map((svc) => ({
      value: svc,
      label: svc,
    }));
  }, [availableServices, urlState.service]);

  // Derive individual active filter chips for display and pruning
  const chips = useMemo<FilterChip[]>(() => {
    const list: FilterChip[] = [];

    if (urlState.q.trim()) {
      list.push({
        id: "filter-chip-q",
        category: "q",
        label: `Search: "${urlState.q.trim()}"`,
        onRemove: () => setUrlState({ q: "", page: 1 }, { replace: true }),
      });
    }

    for (const s of urlState.status) {
      const formattedLabel = s.charAt(0).toUpperCase() + s.slice(1);
      list.push({
        id: `filter-chip-status-${s}`,
        category: "status",
        label: `Status: ${formattedLabel}`,
        onRemove: () =>
          setUrlState({
            status: urlState.status.filter((item) => item !== s),
            page: 1,
          }),
      });
    }

    for (const sev of urlState.severity) {
      const formattedLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
      list.push({
        id: `filter-chip-severity-${sev}`,
        category: "severity",
        label: `Severity: ${formattedLabel}`,
        onRemove: () =>
          setUrlState({
            severity: urlState.severity.filter((item) => item !== sev),
            page: 1,
          }),
      });
    }

    for (const svc of urlState.service) {
      list.push({
        id: `filter-chip-service-${svc}`,
        category: "service",
        label: `Service: ${svc}`,
        onRemove: () =>
          setUrlState({
            service: urlState.service.filter((item) => item !== svc),
            page: 1,
          }),
      });
    }

    return list;
  }, [urlState.q, urlState.status, urlState.severity, urlState.service, setUrlState]);

  // Reset all filters and search, enforcing page: 1 reset invariant
  const handleClearAll = () => {
    setUrlState({
      q: "",
      status: [],
      severity: [],
      service: [],
      page: 1,
    });
  };

  return (
    <div className={`flex flex-col gap-3 w-full ${className}`}>
      {/* Primary Toolbar Row: Responsive (Stack on mobile, Two-row on tablet, Single-row on desktop) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        {/* Debounced Search Bar */}
        <div className="flex-1 min-w-0">
          <SearchInput
            value={urlState.q}
            onChange={(nextQ) =>
              setUrlState({ q: nextQ, page: 1 }, { replace: true })
            }
          />
        </div>

        {/* Multi-Select Filters Row */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
          <MultiSelectDropdown
            label="Status"
            options={STATUS_OPTIONS}
            selectedValues={urlState.status}
            onChange={(nextStatuses) =>
              setUrlState({ status: nextStatuses, page: 1 })
            }
          />

          <MultiSelectDropdown
            label="Severity"
            options={SEVERITY_OPTIONS}
            selectedValues={urlState.severity}
            onChange={(nextSeverities) =>
              setUrlState({ severity: nextSeverities, page: 1 })
            }
          />

          <MultiSelectDropdown
            label="Service"
            options={serviceOptions}
            selectedValues={urlState.service}
            onChange={(nextServices) =>
              setUrlState({ service: nextServices, page: 1 })
            }
          />
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      <ActiveFilterChips
        chips={chips}
        onClearAll={handleClearAll}
      />
    </div>
  );
}

export default FilterBar;
