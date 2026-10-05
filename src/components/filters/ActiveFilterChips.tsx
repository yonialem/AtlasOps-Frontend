/**
 * ============================================================================
 * AtlasOps Incident Management Console - Active Filter Chips Component
 * ============================================================================
 * File: src/components/filters/ActiveFilterChips.tsx
 * Removable pill chips for individual filter criteria with accessible removal
 * buttons (×) and a prominent "Clear All" button.
 */

export interface FilterChip {
  id: string;
  category: "status" | "severity" | "service" | "q";
  label: string;
  onRemove: () => void;
}

export interface ActiveFilterChipsProps {
  chips: FilterChip[];
  onClearAll: () => void;
  className?: string;
}

export function ActiveFilterChips({
  chips,
  onClearAll,
  className = "",
}: ActiveFilterChipsProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Active filters"
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      <span className="text-xs text-txt-secondary font-medium mr-1 select-none">
        Active Filters:
      </span>
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-elevated border border-border-subtle text-txt-primary shadow-sm"
        >
          <span>{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
            title={`Remove filter: ${chip.label}`}
            className="inline-flex items-center justify-center w-4 h-4 ml-0.5 rounded hover:bg-slate-700 text-txt-secondary hover:text-txt-primary focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
          >
            <span aria-hidden="true" className="text-sm font-bold leading-none select-none">
              &times;
            </span>
            <span className="sr-only">Remove filter {chip.label}</span>
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-medium text-red-400 hover:text-red-300 ml-2 focus:outline-none focus:underline transition-colors"
      >
        Clear All
      </button>
    </div>
  );
}

export default ActiveFilterChips;
