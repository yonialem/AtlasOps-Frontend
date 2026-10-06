/**
 * ============================================================================
 * AtlasOps Incident Management Console - URL State Synchronization Hook
 * ============================================================================
 * File: src/hooks/useUrlState.ts
 * Bidirectional URL SearchParams synchronization hook serving as the single
 * authoritative source of truth for the incident list filters, sorting,
 * pagination, search, and the active incident detail drawer.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  IncidentStatus,
  IncidentSeverity,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
} from "../contracts/incident.types.ts";
import {
  IncidentSortField,
  SortOrder,
  GetIncidentsQuery,
  INCIDENT_SORT_FIELDS,
  ALLOWED_PAGE_SIZES,
} from "../contracts/api.types.ts";

export interface UrlState {
  q: string;
  status: IncidentStatus[];
  severity: IncidentSeverity[];
  service: string[];
  sort: IncidentSortField;
  order: SortOrder;
  page: number;
  pageSize: number;
  incidentId: string | null;
}

export const DEFAULT_URL_STATE: Readonly<UrlState> = {
  q: "",
  status: [],
  severity: [],
  service: [],
  sort: "updatedAt",
  order: "desc",
  page: 1,
  pageSize: 25,
  incidentId: null,
};

const VALID_STATUSES = new Set<string>(INCIDENT_STATUSES);
const VALID_SEVERITIES = new Set<string>(INCIDENT_SEVERITIES);
const VALID_SORT_FIELDS = new Set<string>(INCIDENT_SORT_FIELDS);
const VALID_PAGE_SIZES = new Set<number>(ALLOWED_PAGE_SIZES);

/**
 * Pure function parsing and validating URL search query string into a typed UrlState.
 * Silently discards corrupt tokens and clamps invalid numbers to safe defaults.
 */
export function readUrlState(search?: string): UrlState {
  const rawSearch =
    search !== undefined
      ? search
      : typeof window !== "undefined" && window.location
      ? window.location.search
      : "";

  const params = new URLSearchParams(rawSearch);

  // 1. Search Query: trimmed string, fallback ""
  const rawQ = params.get("q");
  const q = rawQ ? rawQ.trim() : "";

  // 2. Status: comma-separated valid IncidentStatus tokens
  const rawStatus = params.get("status");
  const status: IncidentStatus[] = rawStatus
    ? (rawStatus
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is IncidentStatus => VALID_STATUSES.has(s)))
    : [];

  // 3. Severity: comma-separated valid IncidentSeverity tokens
  const rawSeverity = params.get("severity");
  const severity: IncidentSeverity[] = rawSeverity
    ? (rawSeverity
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is IncidentSeverity => VALID_SEVERITIES.has(s)))
    : [];

  // 4. Service: comma-separated non-empty service identifiers
  const rawService = params.get("service");
  const service: string[] = rawService
    ? rawService
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  // 5. Sort Field: validated against INCIDENT_SORT_FIELDS, fallback "updatedAt"
  const rawSort = params.get("sort");
  const sort: IncidentSortField =
    rawSort && VALID_SORT_FIELDS.has(rawSort)
      ? (rawSort as IncidentSortField)
      : "updatedAt";

  // 6. Sort Order: "asc" or "desc", fallback "desc"
  const rawOrder = params.get("order");
  const order: SortOrder =
    rawOrder === "asc" || rawOrder === "desc" ? rawOrder : "desc";

  // 7. Page: integer >= 1, fallback 1
  const rawPage = params.get("page");
  let page = 1;
  if (rawPage !== null) {
    const parsed = parseInt(rawPage, 10);
    page = !isNaN(parsed) && parsed >= 1 ? parsed : 1;
  }

  // 8. PageSize: supported 10, 25, 50, 100, fallback 25
  const rawPageSize = params.get("pageSize");
  let pageSize = 25;
  if (rawPageSize !== null) {
    const parsed = parseInt(rawPageSize, 10);
    if (!isNaN(parsed) && VALID_PAGE_SIZES.has(parsed)) {
      pageSize = parsed;
    }
  }

  // 9. IncidentId: trimmed string matching non-empty ID, otherwise null
  const rawIncidentId = params.get("incidentId");
  const incidentId: string | null =
    rawIncidentId && rawIncidentId.trim().length > 0
      ? rawIncidentId.trim()
      : null;

  return {
    q,
    status,
    severity,
    service,
    sort,
    order,
    page,
    pageSize,
    incidentId,
  };
}

/**
 * Pure function constructing a clean query string that omits all default
 * and empty values to prevent URL clutter.
 */
export function serializeUrlState(state: UrlState): string {
  const params = new URLSearchParams();

  if (state.q && state.q.trim().length > 0) {
    params.set("q", state.q.trim());
  }

  if (state.status && state.status.length > 0) {
    params.set("status", state.status.join(","));
  }

  if (state.severity && state.severity.length > 0) {
    params.set("severity", state.severity.join(","));
  }

  if (state.service && state.service.length > 0) {
    params.set("service", state.service.join(","));
  }

  if (state.sort && state.sort !== "updatedAt") {
    params.set("sort", state.sort);
  }

  if (state.order && state.order !== "desc") {
    params.set("order", state.order);
  }

  if (state.page && state.page > 1) {
    params.set("page", String(state.page));
  }

  if (state.pageSize && state.pageSize !== 25) {
    params.set("pageSize", String(state.pageSize));
  }

  if (state.incidentId && state.incidentId.trim().length > 0) {
    params.set("incidentId", state.incidentId.trim());
  }

  return params.toString();
}

function areArraysEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

export interface SetUrlStateOptions {
  replace?: boolean; // If true, uses history.replaceState; otherwise history.pushState (default: false)
}

export interface UseUrlStateReturn {
  state: UrlState;
  setUrlState: (
    updates: Partial<UrlState> | ((prev: UrlState) => Partial<UrlState>),
    options?: SetUrlStateOptions
  ) => void;
  resetFilters: () => void;
  clearAll: () => void;
  openIncident: (id: string) => void;
  closeIncident: () => void;
  queryObject: GetIncidentsQuery;
}

/**
 * Custom React hook providing bidirectional synchronization between React state
 * and the browser URL search parameters.
 */
export function useUrlState(): UseUrlStateReturn {
  const [state, setState] = useState<UrlState>(() => readUrlState());
  const stateRef = useRef<UrlState>(state);
  stateRef.current = state;

  // Listen to browser Back/Forward popstate events
  useEffect(() => {
    if (typeof window === "undefined" || !window.addEventListener) return;

    const handlePopState = () => {
      const newState = readUrlState();
      stateRef.current = newState;
      setState(newState);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const setUrlState = useCallback(
    (
      updates: Partial<UrlState> | ((prev: UrlState) => Partial<UrlState>),
      options?: SetUrlStateOptions
    ) => {
      const prevState = stateRef.current;
      const resolvedUpdates =
        typeof updates === "function" ? updates(prevState) : updates;

      // Page Reset Invariant:
      // If q, status, severity, service, or pageSize changed AND page was NOT explicitly specified,
      // automatically reset page to 1.
      const filterChanged =
        (resolvedUpdates.q !== undefined &&
          resolvedUpdates.q.trim() !== prevState.q) ||
        (resolvedUpdates.status !== undefined &&
          !areArraysEqual(resolvedUpdates.status, prevState.status)) ||
        (resolvedUpdates.severity !== undefined &&
          !areArraysEqual(resolvedUpdates.severity, prevState.severity)) ||
        (resolvedUpdates.service !== undefined &&
          !areArraysEqual(resolvedUpdates.service, prevState.service)) ||
        (resolvedUpdates.pageSize !== undefined &&
          resolvedUpdates.pageSize !== prevState.pageSize);

      let nextPage = prevState.page;
      if (resolvedUpdates.page !== undefined) {
        nextPage = resolvedUpdates.page;
      } else if (filterChanged) {
        nextPage = 1;
      }

      const nextState: UrlState = {
        ...prevState,
        ...resolvedUpdates,
        page: nextPage,
      };

      stateRef.current = nextState;
      setState(nextState);

      // Synchronize with HTML5 History API
      if (typeof window !== "undefined" && window.location && window.history) {
        const currentPath = window.location.pathname || "/";
        const currentHash = window.location.hash || "";
        const newQueryString = serializeUrlState(nextState);
        const newUrl = `${currentPath}${newQueryString ? `?${newQueryString}` : ""}${currentHash}`;

        if (options?.replace) {
          window.history.replaceState(null, "", newUrl);
        } else {
          window.history.pushState(null, "", newUrl);
        }

        if (typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new Event("popstate"));
        }
      }
    },
    []
  );

  const resetFilters = useCallback(() => {
    setUrlState({
      q: "",
      status: [],
      severity: [],
      service: [],
      page: 1,
    });
  }, [setUrlState]);

  const clearAll = useCallback(() => {
    setUrlState(DEFAULT_URL_STATE);
  }, [setUrlState]);

  const openIncident = useCallback(
    (id: string) => {
      setUrlState({ incidentId: id });
    },
    [setUrlState]
  );

  const closeIncident = useCallback(() => {
    setUrlState({ incidentId: null });
  }, [setUrlState]);

  // Formatted object conforming to GetIncidentsQuery ready for TanStack Query
  const queryObject: GetIncidentsQuery = useMemo(
    () => ({
      q: state.q,
      status: state.status.join(","),
      severity: state.severity.join(","),
      service: state.service.join(","),
      sort: state.sort,
      order: state.order,
      page: state.page,
      pageSize: state.pageSize,
    }),
    [
      state.q,
      state.status,
      state.severity,
      state.service,
      state.sort,
      state.order,
      state.page,
      state.pageSize,
    ]
  );

  return {
    state,
    setUrlState,
    resetFilters,
    clearAll,
    openIncident,
    closeIncident,
    queryObject,
  };
}

export default useUrlState;
