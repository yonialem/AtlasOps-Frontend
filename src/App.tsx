import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  Activity,
  Wifi,
  WifiOff,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  RefreshCw,
  Server,
} from "lucide-react";
import {
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
} from "@contracts";
import { serviceKeys, listServices, QueryProvider } from "./api/index.ts";

function AppContent() {
  const [isOnline, setIsOnline] = useState<boolean>(
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

  // TanStack Query hook fetching /api/services to inspect backend health and connection
  const {
    data: services,
    isLoading: isServicesLoading,
    isError: isServicesError,
    error: servicesError,
    refetch: refetchServices,
    isFetching: isServicesFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: serviceKeys.list(),
    queryFn: ({ signal }) => listServices(signal),
    enabled: isOnline,
  });

  const apiStatus: "checking" | "connected" | "disconnected" = !isOnline
    ? "disconnected"
    : isServicesLoading
    ? "checking"
    : isServicesError
    ? "disconnected"
    : "connected";

  return (
    <div className="min-h-screen bg-app-bg text-txt-primary flex flex-col selection:bg-blue-600 selection:text-white">
      {/* ARIA Live Regions for Assistive Technologies */}
      <div
        id="a11y-status-announcer"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        id="a11y-alert-announcer"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Persistent Offline Banner if offline */}
      {!isOnline && (
        <div
          role="alert"
          className="bg-amber-950/80 border-b border-amber-600 px-4 py-2 text-center text-sm font-medium text-amber-200 flex items-center justify-center gap-2"
        >
          <WifiOff className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <span>You are currently working in offline mode. Changes will be queued and synchronized upon reconnection.</span>
        </div>
      )}

      {/* Brand Header */}
      <header className="border-b border-border-subtle bg-surface/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/30 text-blue-400">
              <ShieldAlert className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-txt-primary">
                  AtlasOps
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-blue-950 text-blue-400 border border-blue-800">
                  CONSOLE v1.0
                </span>
              </div>
              <p className="text-xs text-txt-secondary hidden sm:block">
                Production Incident Management &amp; High-Availability Triage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Operational Status Badge */}
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                apiStatus === "connected"
                  ? "bg-emerald-950/60 border-emerald-600/40 text-emerald-300"
                  : apiStatus === "checking"
                  ? "bg-blue-950/60 border-blue-600/40 text-blue-300"
                  : "bg-red-950/60 border-red-600/40 text-red-300"
              }`}
              aria-label="System operational status"
            >
              <span className="relative flex h-2 w-2">
                {apiStatus === "connected" && (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                )}
                {apiStatus === "checking" && (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400 animate-pulse"></span>
                )}
                {apiStatus === "disconnected" && (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"></span>
                )}
              </span>
              <span>
                {apiStatus === "connected"
                  ? "Systems Operational"
                  : apiStatus === "checking"
                  ? "Probing API..."
                  : "API Disconnected"}
              </span>
            </div>

            {/* Connection Status Indicator */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
                isOnline && apiStatus === "connected"
                  ? "bg-slate-800 border-slate-700 text-slate-300"
                  : isOnline && apiStatus === "checking"
                  ? "bg-blue-950/60 border-blue-700 text-blue-300"
                  : "bg-amber-950/60 border-amber-600/40 text-amber-300"
              }`}
              title={
                isOnline
                  ? `Network: Online | API: ${apiStatus} | Proxy: :3001`
                  : "Network: Offline"
              }
            >
              {isOnline ? (
                apiStatus === "connected" ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                    <span className="hidden md:inline">API Connected (:3001)</span>
                    <span className="md:hidden">Connected</span>
                  </>
                ) : apiStatus === "checking" ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" aria-hidden="true" />
                    <span>Checking API</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span>Disconnected</span>
                  </>
                )
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>Offline</span>
                </>
              )}
            </div>

            {/* Manual Retry Connection Button if error */}
            {isOnline && apiStatus === "disconnected" && (
              <button
                type="button"
                onClick={() => refetchServices()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                title="Retry connecting to API"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col justify-center">
        <div className="bg-surface border border-border-subtle rounded-xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-border-subtle">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-5 h-5 text-blue-400" aria-hidden="true" />
                <h1 className="text-2xl font-bold tracking-tight text-txt-primary">
                  AtlasOps Incident Management Console
                </h1>
              </div>
              <p className="text-txt-secondary text-sm max-w-2xl leading-relaxed">
                Frontend architecture and tooling are fully initialized. Built with React 18, TypeScript 5.5,
                Tailwind CSS, and TanStack Query with strict WCAG 2.1 AA accessibility and full offline resilience.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded bg-surface-elevated text-slate-300 border border-slate-600 font-mono">
                Port :3000
              </span>
              <span className="px-2.5 py-1 rounded bg-surface-elevated text-slate-300 border border-slate-600 font-mono">
                Proxy /api -&gt; :3001
              </span>
            </div>
          </div>

          {/* Backend Connection Diagnostics Section */}
          <section
            aria-labelledby="diagnostics-heading"
            className="mt-6 p-4 rounded-lg bg-surface-elevated border border-border-subtle"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" aria-hidden="true" />
                <h2 id="diagnostics-heading" className="text-sm font-semibold text-txt-primary">
                  Backend API &amp; TanStack Query Diagnostics
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {isServicesFetching && (
                  <span className="inline-flex items-center gap-1 text-blue-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Fetching...
                  </span>
                )}
                {dataUpdatedAt > 0 && (
                  <span className="text-txt-secondary font-mono">
                    Last synced: {new Date(dataUpdatedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded bg-app-bg border border-border-subtle">
                <div className="text-txt-secondary mb-1">Health Probe (/api/services)</div>
                <div className="font-semibold text-txt-primary flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      apiStatus === "connected"
                        ? "bg-emerald-400"
                        : apiStatus === "checking"
                        ? "bg-blue-400 animate-pulse"
                        : "bg-red-400"
                    }`}
                  />
                  <span>
                    {apiStatus === "connected"
                      ? "200 OK (Healthy)"
                      : apiStatus === "checking"
                      ? "Probing..."
                      : "Unreachable / Error"}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded bg-app-bg border border-border-subtle">
                <div className="text-txt-secondary mb-1">Discovered Services</div>
                <div className="font-semibold text-txt-primary">
                  {services ? `${services.length} Monitored Services` : "Pending discovery..."}
                </div>
              </div>

              <div className="p-3 rounded bg-app-bg border border-border-subtle">
                <div className="text-txt-secondary mb-1">Cache Configuration</div>
                <div className="font-mono text-txt-primary">
                  staleTime: 30s &bull; gcTime: 5m
                </div>
              </div>
            </div>

            {/* List discovered services if available */}
            {services && services.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border-subtle">
                <div className="text-xs text-txt-secondary mb-2">Monitored Service Catalog:</div>
                <div className="flex flex-wrap gap-1.5">
                  {services.map((svc) => (
                    <span
                      key={svc}
                      className="px-2 py-0.5 rounded text-xs font-mono bg-blue-950/60 text-blue-300 border border-blue-800"
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Error diagnostics banner if error */}
            {isServicesError && (
              <div
                role="alert"
                className="mt-3 p-3 rounded bg-red-950/50 border border-red-800 text-xs text-red-200 flex items-start justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-red-300 mb-0.5">Connection Error</div>
                  <div>
                    {servicesError instanceof Error
                      ? servicesError.message
                      : "Unable to reach backend API. Ensure mock/backend server is running."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => refetchServices()}
                  className="px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white rounded font-medium flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            )}
          </section>

          {/* Operational Architecture Capability Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-app-bg/60 border border-border-subtle rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-400 font-medium text-sm mb-1.5">
                <Activity className="w-4 h-4" aria-hidden="true" />
                <span>High-Speed Keyboard Triage</span>
              </div>
              <p className="text-xs text-txt-secondary leading-normal">
                Engineered for rapid triaging with <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated text-slate-200 border border-slate-600">j</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated text-slate-200 border border-slate-600">k</kbd> navigation, <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated text-slate-200 border border-slate-600">/</kbd> search, and <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated text-slate-200 border border-slate-600">c</kbd> modal creation.
              </p>
            </div>

            <div className="bg-app-bg/60 border border-border-subtle rounded-lg p-4">
              <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm mb-1.5">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>Optimistic Updates &amp; Resilience</span>
              </div>
              <p className="text-xs text-txt-secondary leading-normal">
                Sub-second status transitions and note postings with automatic version conflict detection, cache rollbacks, and offline mutation queuing.
              </p>
            </div>

            <div className="bg-app-bg/60 border border-border-subtle rounded-lg p-4">
              <div className="flex items-center gap-2 text-purple-400 font-medium text-sm mb-1.5">
                <Layers className="w-4 h-4" aria-hidden="true" />
                <span>Shared Contract Verification</span>
              </div>
              <p className="text-xs text-txt-secondary leading-normal">
                Strict type safety and schema validation directly tied to <code className="text-blue-300">@contracts</code> with zero runtime type divergence.
              </p>
            </div>
          </div>

          {/* Contract Domain Tokens Indicator */}
          <div className="mt-6 pt-4 border-t border-border-subtle flex flex-wrap items-center justify-between gap-4 text-xs text-txt-secondary">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span>
                Domain Contracts: {INCIDENT_STATUSES.length} Statuses ({INCIDENT_STATUSES.join(", ")}) &bull; {INCIDENT_SEVERITIES.length} Severities ({INCIDENT_SEVERITIES.join(", ")})
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <AlertTriangle className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>WCAG 2.1 AA Compliant Contrast &amp; Focus Management</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle bg-surface/40 py-4 px-4 text-center text-xs text-txt-muted">
        AtlasOps Incident Management Console &bull; High Reliability Mission-Critical Tooling
      </footer>
    </div>
  );
}

export function App() {
  return (
    <QueryProvider>
      <AppContent />
    </QueryProvider>
  );
}

export default App;
