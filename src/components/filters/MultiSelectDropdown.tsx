/**
 * ============================================================================
 * AtlasOps Incident Management Console - Multi-Select Dropdown Component
 * ============================================================================
 * File: src/components/filters/MultiSelectDropdown.tsx
 * Accessible popover dropdown for multi-value filtering (Status, Severity, Service)
 * with badge indicators, active count labels, outside-click detection, Esc dismissal,
 * and >= 44x44px mobile touch targets.
 */

import { useState, useRef, useEffect, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  badge?: ReactNode; // Optional StatusBadge / SeverityBadge icon
}

export interface MultiSelectDropdownProps<T extends string = string> {
  label: string;                  // e.g. "Status", "Severity", "Service"
  options: readonly DropdownOption<T>[];
  selectedValues: readonly T[];
  onChange: (selected: T[]) => void;
  disabled?: boolean;
}

export function MultiSelectDropdown<T extends string = string>({
  label,
  options,
  selectedValues,
  onChange,
  disabled = false,
}: MultiSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Label showing count: "{label}: All" when empty, "{label} (N)" when items selected
  const triggerLabel =
    selectedValues.length === 0
      ? `${label}: All`
      : `${label} (${selectedValues.length})`;

  // Outside-click detection and Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = (value: T) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left w-full sm:w-auto">
      {/* Popover Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={triggerLabel}
        className={`w-full sm:w-auto inline-flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors select-none min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          selectedValues.length > 0
            ? "bg-blue-950/40 border-blue-600/50 text-blue-200 hover:bg-blue-950/60"
            : "bg-surface-elevated border-border-subtle text-txt-secondary hover:text-txt-primary hover:bg-slate-700/50"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-txt-secondary shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={`${label} options`}
          className="absolute left-0 mt-1.5 z-50 w-full sm:w-auto min-w-[220px] max-h-72 overflow-y-auto bg-surface border border-border-subtle rounded-lg shadow-2xl py-1 focus:outline-none"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-txt-muted italic select-none">
              No options available
            </div>
          ) : (
            options.map((option) => {
              const isChecked = selectedValues.includes(option.value);
              return (
                <label
                  key={option.value}
                  role="option"
                  aria-selected={isChecked}
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-elevated cursor-pointer select-none text-xs transition-colors min-h-[44px] group"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(option.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleToggle(option.value);
                      }
                    }}
                    aria-label={option.label}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer shrink-0"
                  />
                  {option.badge && <span className="shrink-0">{option.badge}</span>}
                  <span className="text-txt-primary group-hover:text-white truncate flex-1">
                    {option.label}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default MultiSelectDropdown;
