import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  Wifi,
  WifiOff,
  Terminal,
  AlertTriangle,
  RefreshCw,
  Plus,
} from "lucide-react";
import { Incident, IncidentSortField } from "@contracts";
import {
  incidentKeys,
  listIncidents,
  serviceKeys,
  listServices,
  userKeys,
  listUsers,
  QueryProvider,
} from "./api/index.ts";
import { useUrlState, useConnectivity } from "./hooks/index.ts";
import {
  IncidentList,
  PaginationControls,
} from "./components/incidents/index.ts";
import { FilterBar } from "./components/filters/index.ts";
import { IncidentDrawer } from "./components/drawer/index.ts";
import { CreateIncidentModal } from "./components/modals/index.ts";
import {
  ToastProvider,
  ToastContainer,
  useToast,
} from "./components/notifications/index.ts";
import { OfflineBanner, OutageScreen } from "./components/common/index.ts";
import { getQueueCount, replayQueue } from "./services/index.ts";

function AppContent() {
  const { isOnline } = useConnectivity();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [queuedCount, setQueuedCount] = useState<number>(() => getQueueCount());
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const prevOnlineRef = useRef<boolean>(isOnline);

  const {
    state: urlState,
    setUrlState,
    resetFilters,
    openIncident,
    closeIncident,
    queryObject,
  } = useUrlState();

  // Listen to storage events & periodic intervals to sync queued items counter
  useEffect(() => {
    const updateCount = () => setQueuedCount(getQueueCount());
    window.addEventListener("storage", updateCount);
    const interval = setInterval(updateCount, 1000);
    return () => {
      window.removeEventListener("storage", updateCount);
      clearInterval(interval);
    };
  }, []);

  // Automatically trigger mutation queue replay when reconnecting (offline -> online)
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      replayQueue(queryClient, showToast).then(() => {
        setQueuedCount(getQueueCount());
      });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, queryClient, showToast]);

  // If online on initial mount with leftover queued items, trigger replay
  useEffect(() => {
    if (isOnline && getQueueCount() > 0) {
      replayQueue(queryClient, showToast).then(() => {
        setQueuedCount(getQueueCount());
      });
    }
  }, []);


  // Global hotkey listener: 'c' opens Create Incident Modal when not editing text
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c" || e.key === "C") {
        const active = document.activeElement;
        const tagName = active?.tagName?.toUpperCase();
        const isEditable =
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT" ||
          (active as HTMLElement | null)?.isContentEditable;

        if (!isEditable) {
          e.preventDefault();
          setIsCreateModalOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  // TanStack Query hook fetching /api/services to inspect backend health and provide service filter options
  const {
    data: servicesData,
    isLoading: isServicesLoading,
    isError: isServicesError,
    refetch: refetchServices,
  } = useQuery({
    queryKey: serviceKeys.list(),
    queryFn: ({ signal }) => listServices(signal),
    enabled: isOnline,
  });

  // TanStack Query hook fetching /api/users for operator directory
  const { data: usersData } = useQuery({
    queryKey: userKeys.list(),
    queryFn: ({ signal }) => listUsers(signal),
    enabled: isOnline,
  });

  // TanStack Query hook fetching incidents based on current URL parameters
  const {
    data: incidentsData,
    isLoading: isIncidentsLoading,
    isError: isIncidentsError,
    error: incidentsError,
    refetch: refetchIncidents,
  } = useQuery({
    queryKey: incidentKeys.list(queryObject),
    queryFn: ({ signal }) => listIncidents(queryObject, signal),
  });

  const selectedIncident = useMemo(() => {
    if (!urlState.incidentId) return undefined;
    return (
      queryClient.getQueryData<Incident>(incidentKeys.detail(urlState.incidentId)) ??
      incidentsData?.items.find((inc) => inc.id === urlState.incidentId)
    );
  }, [urlState.incidentId, incidentsData?.items, queryClient]);

  const apiStatus: "checking" | "connected" | "disconnected" = !isOnline
    ? "disconnected"
    : isServicesLoading
    ? "checking"
    : isServicesError
    ? "disconnected"
    : "connected";

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

  const hasCachedIncidents = Boolean(
    incidentsData?.items && incidentsData.items.length > 0
  );

  // When query fails completely with no cached incidents, display diagnostic OutageScreen
  if (isIncidentsError && !hasCachedIncidents) {
    return (
      <div className="min-h-screen bg-app-bg text-txt-primary flex flex-col selection:bg-blue-600 selection:text-white">
        <OfflineBanner isOnline={isOnline} queuedCount={queuedCount} />
        <main className="flex-1 flex items-center justify-center p-4">
          <OutageScreen
            error={incidentsError as Error}
            onRetry={() => refetchIncidents()}
            isRetrying={isIncidentsLoading}
          />
        </main>
      </div>
    );
  }

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
      <OfflineBanner isOnline={isOnline} queuedCount={queuedCount} />

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
              <span className="hidden sm:inline">
                {apiStatus === "connected"
                  ? "Systems Operational"
                  : apiStatus === "checking"
                  ? "Probing API..."
                  : "API Disconnected"}
              </span>
            </div>

            {/* Connection Status Indicator */}
            <div
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
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

            {/* New Incident CTA Button */}
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 min-h-[44px]"
              title="Create new incident (Press 'c')"
              aria-label="Create new incident"
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>New Incident</span>
              <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono font-medium bg-blue-700/60 rounded border border-blue-400/30 text-blue-100">
                c
              </kbd>
            </button>
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

          {/* Incident Detail Slide-Over Drawer */}
          <IncidentDrawer
            incidentId={urlState.incidentId}
            incident={selectedIncident}
            users={usersData ?? []}
            onClose={closeIncident}
          />

          {/* Create Incident Modal Dialog */}
          <CreateIncidentModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            services={servicesData ?? []}
            users={usersData ?? []}
            isOnline={isOnline}
            onSuccess={(created) => {
              queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
              openIncident(created.id);
            }}
          />

          {/* Primary Incident Feed Section */}
          <section aria-labelledby="incident-feed-heading" className="mt-6">
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

            {/* Filter & Search Toolbar */}
            <FilterBar
              availableServices={servicesData ?? []}
              isLoading={isIncidentsLoading}
              className="mb-4"
              urlState={urlState}
              setUrlState={setUrlState}
            />

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
      <ToastProvider>
        <AppContent />
        <ToastContainer />
      </ToastProvider>
    </QueryProvider>
  );
}

export default App;
