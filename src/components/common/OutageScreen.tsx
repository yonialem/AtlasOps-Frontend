/**
 * ============================================================================
 * AtlasOps Incident Management Console - Service Outage Diagnostic Screen
 * ============================================================================
 * File: src/components/common/OutageScreen.tsx
 * Full-page / card diagnostic view displayed when root query feeds completely
 * fail to resolve due to network disconnection, backend outage, or proxy errors.
 */

import { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw, Wifi, WifiOff, Server, Terminal } from "lucide-react";
import { getApiBaseUrl } from "../../api/client.ts";

export interface OutageScreenProps {
  error?: Error | null;
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
}

export function OutageScreen({
  error,
  onRetry,
  isRetrying = false,
  className = "",
}: OutageScreenProps) {
  const [timestamp] = useState<string>(() => new Date().toISOString());
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const apiBaseUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
    getApiBaseUrl() ||
    "/api";

  const targetEndpoint = apiBaseUrl.startsWith("http")
    ? `${apiBaseUrl}/incidents`
    : `${apiBaseUrl}/incidents`;

  const errorMessage = error?.message || "Network request failed";

  return (
    <div
      role="region"
      aria-labelledby="outage-title"
      className={`min-h-[60vh] flex items-center justify-center p-6 ${className}`}
    >
      <div className="max-w-xl w-full bg-surface border border-red-900/50 rounded-2xl shadow-2xl p-6 sm:p-8 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 pb-4 border-b border-border-subtle">
          <div className="p-3 bg-red-950/60 border border-red-700/50 rounded-xl text-red-400">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1
              id="outage-title"
              className="text-xl font-bold tracking-tight text-txt-primary"
            >
              Service Connection Unavailable
            </h1>
            <p className="text-xs text-txt-secondary mt-0.5">
              Unable to establish a reliable connection to the incident management API.
            </p>
          </div>
        </div>

        <p className="text-sm text-txt-secondary my-4 leading-relaxed">
          The AtlasOps console could not retrieve live incident feeds. This usually indicates
          a temporary network disruption, local proxy failure, or total backend service maintenance.
        </p>

        {/* Diagnostics Card */}
        <div className="bg-surface-elevated border border-border-subtle rounded-xl p-4 text-xs font-mono space-y-2 mb-6">
          <div className="flex items-center justify-between text-txt-muted pb-2 border-b border-border-subtle">
            <span className="flex items-center gap-1.5 font-sans font-semibold text-txt-primary">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              Diagnostics Information
            </span>
            <span className="text-[11px] text-txt-muted">{timestamp}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-txt-muted">Target API Endpoint:</span>
            <span className="text-blue-300 font-semibold truncate" title={targetEndpoint}>
              {targetEndpoint}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-txt-muted">Browser Online Status:</span>
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                isOnline ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span>Online (Network reachable)</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Offline (No network link)</span>
                </>
              )}
            </span>
          </div>

          <div className="pt-2 border-t border-border-subtle">
            <span className="text-txt-muted block mb-1">Error Details:</span>
            <div className="bg-red-950/40 text-red-300 border border-red-900/60 rounded p-2.5 break-words font-sans text-xs">
              {errorMessage}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 min-h-[44px]"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{isRetrying ? "Retrying Connection..." : "Retry Connection"}</span>
          </button>

          <a
            href="/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-elevated hover:bg-slate-700 text-txt-secondary hover:text-txt-primary border border-border-subtle transition-colors min-h-[44px]"
          >
            <Server className="w-4 h-4 text-txt-muted" />
            <span>Check Health Status</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default OutageScreen;
