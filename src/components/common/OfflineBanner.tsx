/**
 * ============================================================================
 * AtlasOps Incident Management Console - Persistent Offline Banner
 * ============================================================================
 * File: src/components/common/OfflineBanner.tsx
 * Persistent, accessible banner displayed when the operator is working offline.
 * Informs the operator that mutations are enqueued locally and displays
 * the count of pending mutations waiting for reconnection synchronization.
 */

import { WifiOff } from "lucide-react";

export interface OfflineBannerProps {
  isOnline?: boolean;
  queuedCount?: number;
  className?: string;
}

export function OfflineBanner({
  isOnline,
  queuedCount,
  className = "",
}: OfflineBannerProps) {
  // If explicitly online, do not render
  if (isOnline === true) {
    return null;
  }

  const count = typeof queuedCount === "number" ? queuedCount : 0;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`bg-amber-950/90 border-b border-amber-600 text-amber-200 px-4 py-2 text-center text-sm font-medium flex flex-wrap items-center justify-center gap-2 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
        <span>
          You are currently offline. Displaying cached incident data. Active status, assignment, and note updates will be queued locally and synchronized automatically when connectivity is restored.
        </span>
      </div>

      {count > 0 && (
        <span
          data-testid="offline-queued-badge"
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 ml-1"
        >
          {`${count} pending ${count === 1 ? "change" : "changes"} queued for sync`}
        </span>
      )}
    </div>
  );
}

export default OfflineBanner;
