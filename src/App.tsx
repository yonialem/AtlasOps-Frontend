import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  Wifi,
  WifiOff,
  Terminal,
  AlertTriangle,
  RefreshCw,
  Link as LinkIcon,
  Search,
  Filter,
  X,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import {
  INCIDENT_STATUSES,
  IncidentStatus,
  IncidentSortField,
} from "@contracts";
import {
  incidentKeys,
  listIncidents,
  serviceKeys,
  listServices,
  QueryProvider,
} from "./api/index.ts";
import { useUrlState, serializeUrlState } from "./hooks/index.ts";
import {
  IncidentList,
  PaginationControls,
} from "./components/incidents/index.ts";

function AppContent() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const {
    state: urlState,
    setUrlState,
    resetFilters,
    clearAll,
    openIncident,
    closeIncident,
    queryObject,
  } = useUrlState();

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
    isLoading: isServicesLoading,
    isError: isServicesError,
    refetch: refetchServices,
  } = useQuery({
    queryKey: serviceKeys.list(),
    queryFn: ({ signal }) => listServices(signal),
    enabled: isOnline,
  });

  // TanStack Query hook fetching incidents based on current URL parameters
  const {
    data: incidentsData,
    isLoading: isIncidentsLoading,
    isError: isIncidentsError,
    refetch: refetchIncidents,
  } = useQuery({
    queryKey: incidentKeys.list(queryObject),
    queryFn: ({ signal }) => listIncidents(queryObject, signal),
  });

  const apiStatus: "checking" | "connected" | "disconnected" = !isOnline
    ? "disconnected"
    : isServicesLoading
    ? "checking"
    : isServicesError
    ? "disconnected"
    : "connected";

  const toggleStatusFilter = (status: IncidentStatus) => {
    const exists = urlState.status.includes(status);
    const nextStatuses = exists
      ? urlState.status.filter((s) => s !== status)
      : [...urlState.status, status];
    setUrlState({ status: nextStatuses });
  };

  const handleSortChange = (field: IncidentSortField) => {
    if (urlState.sort === field) {
      setUrlState({ order: urlState.order === "asc" ? "desc" : "asc" });
    } else {
      setUrlState({ sort: field, order: "desc" });
    }
  };

  const hasActiveFilters = Boolean(
    urlState.q.trim() ||
      urlState.status.length > 0 ||
      urlState.severity.length > 0 ||
      urlState.service.length > 0
  );

  const serializedQuery = serializeUrlState(urlState);

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
        <div className="bg-surface border border-border-subtle rounded-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
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
                Production Incident Triage &amp; Management Interface. Built with React 18, TypeScript 5.5,
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

          {/* URL State Synchronization Controls & Filter Panel */}
          <section
            aria-labelledby="url-state-heading"
            className="mt-6 p-4 rounded-lg bg-surface-elevated border border-border-subtle"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                <h2 id="url-state-heading" className="text-sm font-semibold text-txt-primary">
                  Incident Filters &amp; URL State (<code className="font-mono text-cyan-300">useUrlState</code>)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-colors"
                >
                  <Filter className="w-3 h-3" />
                  <span>Reset Filters</span>
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              </div>
            </div>

            {/* Current Serialized URL String */}
            <div className="p-2.5 rounded bg-app-bg border border-border-subtle font-mono text-xs text-txt-secondary flex items-center justify-between gap-2 overflow-x-auto">
              <span className="text-slate-400 shrink-0">Current Query:</span>
              <span className="text-cyan-300 truncate">
                {serializedQuery ? `?${serializedQuery}` : "(empty - all defaults)"}
              </span>
            </div>

            {/* Interactive URL State Controls for Browser Verification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-xs">
              {/* Search q input with replace: true */}
              <div className="p-3 rounded bg-app-bg border border-border-subtle">
                <label htmlFor="url-search-input" className="block text-txt-secondary mb-1">
                  Search Query (q)
                </label>
                <div className="relative">
                  <input
                    id="url-search-input"
                    type="text"
                    value={urlState.q}
                    onChange={(e) => setUrlState({ q: e.target.value }, { replace: true })}
                    placeholder="Search incidents..."
                    className="w-full bg-surface-elevated border border-border-subtle rounded px-2.5 py-1 text-txt-primary text-xs placeholder:text-txt-muted focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Search className="w-3.5 h-3.5 text-txt-muted absolute right-2.5 top-1.5 pointer-events-none" />
                </div>
              </div>

              {/* Status Multi-Select Toggle */}
              <div className="p-3 rounded bg-app-bg border border-border-subtle">
                <div className="text-txt-secondary mb-1">Status Filter (resets page: 1)</div>
                <div className="flex flex-wrap gap-1">
                  {INCIDENT_STATUSES.map((status) => {
                    const active = urlState.status.includes(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => toggleStatusFilter(status)}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                          active
                            ? "bg-blue-600 text-white font-semibold"
                            : "bg-surface-elevated text-slate-400 hover:text-slate-200 border border-slate-700"
                        }`}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pagination Controls */}
              <div className="p-3 rounded bg-app-bg border border-border-subtle">
                <div className="text-txt-secondary mb-1">Pagination State</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-txt-primary">
                    Page {urlState.page} &bull; {urlState.pageSize}/page
                  </span>
                  <div className="flex gap-1 ml-auto">
                    <button
                      type="button"
                      disabled={urlState.page <= 1}
                      onClick={() => setUrlState({ page: Math.max(1, urlState.page - 1) })}
                      className="px-2 py-0.5 rounded bg-surface-elevated hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-mono text-[11px]"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrlState({ page: urlState.page + 1 })}
                      className="px-2 py-0.5 rounded bg-surface-elevated hover:bg-slate-700 text-slate-300 font-mono text-[11px]"
                    >
                      +1
                    </button>
                  </div>
                </div>
              </div>

              {/* Incident Detail Drawer Hook */}
              <div className="p-3 rounded bg-app-bg border border-border-subtle">
                <div className="text-txt-secondary mb-1">Detail Drawer (incidentId)</div>
                <div className="flex items-center gap-1.5">
                  {urlState.incidentId ? (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800 font-mono">
                      <span>{urlState.incidentId}</span>
                      <button
                        type="button"
                        onClick={closeIncident}
                        className="hover:text-amber-100"
                        title="Close incident drawer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openIncident("INC-1042")}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700 font-mono transition-colors"
                    >
                      <span>Open INC-1042</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Primary Incident Feed Section */}
          <section aria-labelledby="incident-feed-heading" className="mt-8">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 id="incident-feed-heading" className="text-lg font-bold text-txt-primary tracking-tight">
                  Incidents Feed
                </h2>
                <p className="text-xs text-txt-secondary">
                  High-availability incident triage across desktop table and mobile card views.
                </p>
              </div>

              {isIncidentsError && (
                <button
                  type="button"
                  onClick={() => refetchIncidents()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Feed</span>
                </button>
              )}
            </div>

            {/* Responsive Table / Card Container */}
            <IncidentList
              incidents={incidentsData?.items ?? []}
              isLoading={isIncidentsLoading}
              sort={urlState.sort}
              order={urlState.order}
              onSortChange={handleSortChange}
              onSelectIncident={openIncident}
              selectedIncidentId={urlState.incidentId}
              onClearFilters={resetFilters}
              hasActiveFilters={hasActiveFilters}
            />

            {/* Pagination Controls */}
            <PaginationControls
              page={urlState.page}
              pageSize={urlState.pageSize}
              total={incidentsData?.total ?? 0}
              totalPages={incidentsData?.totalPages ?? 1}
              onPageChange={(page) => setUrlState({ page })}
              onPageSizeChange={(pageSize) => setUrlState({ pageSize })}
              disabled={isIncidentsLoading}
              className="mt-4 border-t border-border-subtle pt-2"
            />
          </section>
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
