/**
 * ============================================================================
 * AtlasOps Incident Management Console - Pagination Controls Component
 * ============================================================================
 * File: src/components/incidents/PaginationControls.tsx
 * Accessible pagination toolbar supporting range summary, first/prev/next/last
 * navigations, and page size selection ([10, 25, 50, 100]).
 */

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { ALLOWED_PAGE_SIZES } from "../../contracts/api.types.ts";

export interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
  disabled?: boolean;
  className?: string;
}

export function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  className = "",
}: PaginationControlsProps) {
  const isFirstDisabled = page <= 1 || disabled;
  const isLastDisabled = page >= totalPages || total === 0 || disabled;

  // Format range summary: "Showing 1–25 of 1,048 incidents"
  let rangeSummary = "Showing 0 of 0 incidents";
  if (total > 0) {
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    rangeSummary = `Showing ${start}–${end} of ${total.toLocaleString()} incidents`;
  }

  return (
    <nav
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 text-xs text-txt-secondary ${className}`}
      aria-label="Pagination Navigation"
    >
      {/* Range Summary */}
      <div className="font-mono text-xs text-txt-secondary order-2 sm:order-1">
        {rangeSummary}
      </div>

      {/* Controls Group */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-6 order-1 sm:order-2">
        {/* Page Size Selector */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="page-size-selector" className="text-txt-secondary whitespace-nowrap">
            Per page:
          </label>
          <select
            id="page-size-selector"
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-surface-elevated border border-border-subtle rounded px-2 py-1 text-txt-primary text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
          >
            {ALLOWED_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {/* Page Navigation Buttons */}
        <div className="flex items-center gap-1">
          {/* First Page */}
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={isFirstDisabled}
            aria-label="First page"
            title="First page"
            className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] p-1.5 rounded bg-surface-elevated border border-border-subtle hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Previous Page */}
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={isFirstDisabled}
            aria-label="Previous page"
            title="Previous page"
            className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] p-1.5 rounded bg-surface-elevated border border-border-subtle hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Current Page Indicator */}
          <span className="font-mono px-2 py-1 text-txt-primary select-none whitespace-nowrap">
            Page {page} of {Math.max(1, totalPages)}
          </span>

          {/* Next Page */}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={isLastDisabled}
            aria-label="Next page"
            title="Next page"
            className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] p-1.5 rounded bg-surface-elevated border border-border-subtle hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Last Page */}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={isLastDisabled}
            aria-label="Last page"
            title="Last page"
            className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] p-1.5 rounded bg-surface-elevated border border-border-subtle hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <ChevronsRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
}

export default PaginationControls;
