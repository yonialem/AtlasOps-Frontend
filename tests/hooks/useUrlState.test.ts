import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_URL_STATE,
  readUrlState,
  serializeUrlState,
  useUrlState,
} from "@/hooks/useUrlState";
import type { UrlState, UseUrlStateReturn } from "@/hooks/useUrlState";

// ---------------------------------------------------------------------------
// Lightweight DOM / Window / History Test Environment Harness
// ---------------------------------------------------------------------------

class MockElement {
  nodeType: number;
  tagName: string;
  ownerDocument: any;
  childNodes: any[];
  style: Record<string, string>;

  constructor(nodeType = 1, tagName = "DIV") {
    this.nodeType = nodeType;
    this.tagName = tagName;
    this.ownerDocument = doc;
    this.childNodes = [];
    this.style = {};
  }

  setAttribute() {}
  removeAttribute() {}
  appendChild(child: any) {
    this.childNodes.push(child);
  }
  removeChild() {}
  insertBefore() {}
  addEventListener() {}
  removeEventListener() {}
}

const doc = {
  nodeType: 9,
  createElement: (tag: string) => new MockElement(1, tag.toUpperCase()),
  createTextNode: () => new MockElement(3, "#text"),
  addEventListener: () => {},
  removeEventListener: () => {},
  activeElement: null,
  defaultView: null as any,
};

class MockLocation {
  private _search = "";
  pathname = "/incidents";

  get search(): string {
    return this._search;
  }

  set search(val: string) {
    if (!val) {
      this._search = "";
    } else {
      this._search = val.startsWith("?") ? val : `?${val}`;
    }
  }

  get href(): string {
    return `http://localhost${this.pathname}${this._search}`;
  }

  toString(): string {
    return this.href;
  }
}

class MockHistory {
  location: MockLocation;

  pushState = vi.fn((_state: any, _unused: string, url?: string | URL | null) => {
    if (url !== undefined && url !== null) {
      const parsed = new URL(url.toString(), "http://localhost");
      this.location.pathname = parsed.pathname;
      this.location.search = parsed.search;
    }
  });

  replaceState = vi.fn((_state: any, _unused: string, url?: string | URL | null) => {
    if (url !== undefined && url !== null) {
      const parsed = new URL(url.toString(), "http://localhost");
      this.location.pathname = parsed.pathname;
      this.location.search = parsed.search;
    }
  });

  constructor(location: MockLocation) {
    this.location = location;
  }
}

const eventListeners = new Map<string, Set<(e: any) => void>>();
function addEventListener(type: string, fn: (e: any) => void) {
  if (!eventListeners.has(type)) eventListeners.set(type, new Set());
  eventListeners.get(type)!.add(fn);
}
function removeEventListener(type: string, fn: (e: any) => void) {
  eventListeners.get(type)?.delete(fn);
}
function dispatchEvent(event: { type: string; [key: string]: any }) {
  eventListeners.get(event.type)?.forEach((fn) => fn(event));
  return true;
}

function renderHook<T>(useHook: () => T) {
  const container = new MockElement(1, "DIV");
  const root = ReactDOM.createRoot(container as any);
  const result = { current: undefined as unknown as T };

  function TestComponent() {
    result.current = useHook();
    return null;
  }

  act(() => {
    root.render(React.createElement(TestComponent));
  });

  return {
    result,
    unmount: () => act(() => root.unmount()),
    rerender: () => act(() => root.render(React.createElement(TestComponent))),
  };
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("URL State Synchronization (TASK-FE-003)", () => {
  let mockLocation: MockLocation;
  let mockHistory: MockHistory;

  beforeEach(() => {
    mockLocation = new MockLocation();
    mockHistory = new MockHistory(mockLocation);
    eventListeners.clear();

    const win = {
      document: doc,
      location: mockLocation,
      history: mockHistory,
      addEventListener: vi.fn(addEventListener),
      removeEventListener: vi.fn(removeEventListener),
      dispatchEvent: vi.fn(dispatchEvent),
      HTMLIFrameElement: class {},
    };
    doc.defaultView = win;

    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("history", mockHistory);
    vi.stubGlobal("location", mockLocation);
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. DEFAULT_URL_STATE Constant
  // -------------------------------------------------------------------------
  describe("DEFAULT_URL_STATE", () => {
    it("defines exact initial default operational parameters", () => {
      expect(DEFAULT_URL_STATE).toEqual({
        q: "",
        status: [],
        severity: [],
        service: [],
        sort: "updatedAt",
        order: "desc",
        page: 1,
        pageSize: 25,
        incidentId: null,
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Pure Functions: readUrlState & serializeUrlState
  // -------------------------------------------------------------------------
  describe("readUrlState pure function", () => {
    it("returns DEFAULT_URL_STATE when given empty query string", () => {
      expect(readUrlState("")).toEqual(DEFAULT_URL_STATE);
      expect(readUrlState("?")).toEqual(DEFAULT_URL_STATE);
    });

    it("parses valid non-default query parameters into typed structure", () => {
      const search =
        "?q=database&status=triggered,investigating&severity=critical,high&service=payments-api,checkout-web&sort=severity&order=asc&page=3&pageSize=50&incidentId=INC-1042";
      const parsed = readUrlState(search);

      expect(parsed).toEqual({
        q: "database",
        status: ["triggered", "investigating"],
        severity: ["critical", "high"],
        service: ["payments-api", "checkout-web"],
        sort: "severity",
        order: "asc",
        page: 3,
        pageSize: 50,
        incidentId: "INC-1042",
      });
    });

    it("discards invalid enum tokens and clamps out-of-range numerical fields", () => {
      const corrupted =
        "?page=-10&pageSize=9999&status=invalidStatus,triggered&severity=super_critical,high&sort=hacked&order=sideways&incidentId=";
      const sanitized = readUrlState(corrupted);

      expect(sanitized.page).toBe(1); // Clamped to 1
      expect(sanitized.pageSize).toBe(25); // Unsupported pageSize falls back to 25
      expect(sanitized.status).toEqual(["triggered"]); // "invalidStatus" discarded
      expect(sanitized.severity).toEqual(["high"]); // "super_critical" discarded
      expect(sanitized.sort).toBe("updatedAt"); // Invalid sort falls back to "updatedAt"
      expect(sanitized.order).toBe("desc"); // Invalid order falls back to "desc"
      expect(sanitized.incidentId).toBeNull(); // Empty string incidentId becomes null
    });

    it("reads window.location.search when search parameter is omitted", () => {
      mockLocation.search = "?q=auth&page=2";
      const result = readUrlState();
      expect(result.q).toBe("auth");
      expect(result.page).toBe(2);
    });
  });

  describe("serializeUrlState pure function", () => {
    it("produces empty string for DEFAULT_URL_STATE to prevent URL clutter", () => {
      expect(serializeUrlState(DEFAULT_URL_STATE)).toBe("");
    });

    it("omits parameters that match their default values", () => {
      const state: UrlState = {
        ...DEFAULT_URL_STATE,
        q: "database", // non-default
        page: 1, // default -> omit
        sort: "updatedAt", // default -> omit
        order: "desc", // default -> omit
        pageSize: 25, // default -> omit
      };

      const serialized = serializeUrlState(state);
      expect(serialized).toBe("q=database");
    });

    it("serializes multi-value filter arrays as comma-separated values", () => {
      const state: UrlState = {
        ...DEFAULT_URL_STATE,
        status: ["triggered", "investigating"],
        severity: ["critical"],
        page: 2,
      };

      const serialized = serializeUrlState(state);
      const params = new URLSearchParams(serialized);

      expect(params.get("status")).toBe("triggered,investigating");
      expect(params.get("severity")).toBe("critical");
      expect(params.get("page")).toBe("2");
      expect(params.has("sort")).toBe(false);
      expect(params.has("order")).toBe(false);
      expect(params.has("pageSize")).toBe(false);
      expect(params.has("incidentId")).toBe(false);
    });

    it("serializes incidentId when present and non-empty", () => {
      const state: UrlState = {
        ...DEFAULT_URL_STATE,
        incidentId: "INC-1042",
      };

      const serialized = serializeUrlState(state);
      expect(serialized).toBe("incidentId=INC-1042");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Acceptance Criteria Tests (TEST-URL-001 through TEST-URL-012)
  // -------------------------------------------------------------------------

  // TEST-URL-001
  it("TEST-URL-001: Default State Initialization - mounts with clean defaults when URL has no params", () => {
    mockLocation.search = "";
    const { result } = renderHook(() => useUrlState());

    expect(result.current.state).toEqual(DEFAULT_URL_STATE);
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.pageSize).toBe(25);
    expect(result.current.state.sort).toBe("updatedAt");
    expect(result.current.state.order).toBe("desc");
    expect(result.current.state.incidentId).toBeNull();
    expect(result.current.state.status).toEqual([]);
    expect(result.current.state.severity).toEqual([]);
    expect(result.current.state.service).toEqual([]);
    expect(result.current.state.q).toBe("");
  });

  // TEST-URL-002
  it("TEST-URL-002: URL Deserialization - parses complex URL into exact typed arrays and integers", () => {
    mockLocation.search =
      "?q=database&status=triggered,investigating&severity=critical&page=3&service=payments-api";
    const { result } = renderHook(() => useUrlState());

    expect(result.current.state.q).toBe("database");
    expect(result.current.state.status).toEqual(["triggered", "investigating"]);
    expect(result.current.state.severity).toEqual(["critical"]);
    expect(result.current.state.service).toEqual(["payments-api"]);
    expect(result.current.state.page).toBe(3);
    expect(result.current.state.pageSize).toBe(25);
    expect(result.current.state.sort).toBe("updatedAt");
    expect(result.current.state.order).toBe("desc");
    expect(result.current.state.incidentId).toBeNull();
  });

  // TEST-URL-003
  it("TEST-URL-003: Corrupted / Invalid Values Fallback - clamps corrupted values gracefully", () => {
    mockLocation.search =
      "?page=-10&pageSize=9999&status=invalidStatus,triggered&sort=hacked&order=sideways";
    const { result } = renderHook(() => useUrlState());

    expect(result.current.state.page).toBe(1);
    expect(result.current.state.pageSize).toBe(25);
    expect(result.current.state.status).toEqual(["triggered"]);
    expect(result.current.state.sort).toBe("updatedAt");
    expect(result.current.state.order).toBe("desc");
  });

  // TEST-URL-004
  it("TEST-URL-004: Clean Serialization (Omits Defaults) - setting default values produces empty query string", () => {
    mockLocation.search = "?q=search&page=2";
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current.setUrlState({
        q: "",
        page: 1,
        sort: "updatedAt",
        order: "desc",
        pageSize: 25,
      });
    });

    expect(mockLocation.search).toBe("");
    expect(result.current.state).toEqual(DEFAULT_URL_STATE);
  });

  // TEST-URL-005
  it("TEST-URL-005: Page Reset Invariant on Filter Change - resets page to 1 when any filter dimension changes", () => {
    mockLocation.search = "?page=3";
    const { result } = renderHook(() => useUrlState());
    expect(result.current.state.page).toBe(3);

    // Updating status resets page to 1
    act(() => {
      result.current.setUrlState({ status: ["investigating"] });
    });
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.status).toEqual(["investigating"]);

    // Manually advance page to 4
    act(() => {
      result.current.setUrlState({ page: 4 });
    });
    expect(result.current.state.page).toBe(4);

    // Updating search q resets page to 1
    act(() => {
      result.current.setUrlState({ q: "payment" });
    });
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.q).toBe("payment");

    // Advance page to 5
    act(() => {
      result.current.setUrlState({ page: 5 });
    });
    expect(result.current.state.page).toBe(5);

    // Updating severity resets page to 1
    act(() => {
      result.current.setUrlState({ severity: ["critical"] });
    });
    expect(result.current.state.page).toBe(1);

    // Advance page to 6
    act(() => {
      result.current.setUrlState({ page: 6 });
    });
    expect(result.current.state.page).toBe(6);

    // Updating service resets page to 1
    act(() => {
      result.current.setUrlState({ service: ["checkout-web"] });
    });
    expect(result.current.state.page).toBe(1);
  });

  // TEST-URL-006
  it("TEST-URL-006: Page Reset Invariant on PageSize Change - resets page to 1 when pageSize changes, but preserves page on sort/order change", () => {
    mockLocation.search = "?page=4";
    const { result } = renderHook(() => useUrlState());
    expect(result.current.state.page).toBe(4);

    // Mutating pageSize resets page to 1
    act(() => {
      result.current.setUrlState({ pageSize: 50 });
    });
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.pageSize).toBe(50);

    // Advance page back to 4
    act(() => {
      result.current.setUrlState({ page: 4 });
    });
    expect(result.current.state.page).toBe(4);

    // Changing sort should NOT reset page
    act(() => {
      result.current.setUrlState({ sort: "severity" });
    });
    expect(result.current.state.page).toBe(4);
    expect(result.current.state.sort).toBe("severity");

    // Changing order should NOT reset page
    act(() => {
      result.current.setUrlState({ order: "asc" });
    });
    expect(result.current.state.page).toBe(4);
    expect(result.current.state.order).toBe("asc");
  });

  // TEST-URL-007
  it("TEST-URL-007: Explicit Page Override Preserved - respects explicit page in update payload", () => {
    mockLocation.search = "?page=1";
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current.setUrlState({ status: ["resolved"], page: 2 });
    });

    expect(result.current.state.page).toBe(2);
    expect(result.current.state.status).toEqual(["resolved"]);

    act(() => {
      result.current.setUrlState({ q: "auth-gateway", page: 3 });
    });

    expect(result.current.state.page).toBe(3);
    expect(result.current.state.q).toBe("auth-gateway");
  });

  // TEST-URL-008
  it("TEST-URL-008: PushState vs ReplaceState - uses history.replaceState when replace: true, otherwise pushState", () => {
    const { result } = renderHook(() => useUrlState());

    // Debounced search typing uses replace: true
    act(() => {
      result.current.setUrlState({ q: "pay" }, { replace: true });
    });

    expect(mockHistory.replaceState).toHaveBeenCalledTimes(1);
    expect(mockHistory.pushState).not.toHaveBeenCalled();

    // Discrete navigation (page jump) uses default pushState
    act(() => {
      result.current.setUrlState({ page: 2 });
    });

    expect(mockHistory.pushState).toHaveBeenCalledTimes(1);

    // Discrete filter update uses default pushState
    act(() => {
      result.current.setUrlState({ status: ["investigating"] });
    });

    expect(mockHistory.pushState).toHaveBeenCalledTimes(2);
  });

  // TEST-URL-009
  it("TEST-URL-009: PopState Browser Back Navigation - updates state when popstate event fires", () => {
    mockLocation.search = "?q=initial&page=1";
    const { result } = renderHook(() => useUrlState());

    expect(result.current.state.q).toBe("initial");
    expect(result.current.state.page).toBe(1);

    // Simulate browser Back button changing window.location.search
    act(() => {
      mockLocation.search = "?q=previous&status=triggered&page=3";
      dispatchEvent({ type: "popstate" });
    });

    expect(result.current.state.q).toBe("previous");
    expect(result.current.state.status).toEqual(["triggered"]);
    expect(result.current.state.page).toBe(3);
  });

  it("removes popstate listener when unmounted", () => {
    const { unmount } = renderHook(() => useUrlState());
    expect(eventListeners.get("popstate")?.size).toBe(1);

    unmount();
    expect(eventListeners.get("popstate")?.size ?? 0).toBe(0);
  });

  // TEST-URL-010
  it("TEST-URL-010: Open & Close Incident Drawer - opens drawer via openIncident and preserves filters on closeIncident", () => {
    mockLocation.search = "?q=pay&service=payments-api&page=2";
    const { result } = renderHook(() => useUrlState());

    expect(result.current.state.incidentId).toBeNull();
    expect(result.current.state.q).toBe("pay");

    // Open drawer
    act(() => {
      result.current.openIncident("INC-1042");
    });

    expect(result.current.state.incidentId).toBe("INC-1042");
    expect(mockLocation.search).toContain("incidentId=INC-1042");
    expect(result.current.state.q).toBe("pay");
    expect(result.current.state.page).toBe(2);

    // Close drawer
    act(() => {
      result.current.closeIncident();
    });

    expect(result.current.state.incidentId).toBeNull();
    expect(mockLocation.search).not.toContain("incidentId=");
    // Active filters preserved
    expect(result.current.state.q).toBe("pay");
    expect(result.current.state.service).toEqual(["payments-api"]);
    expect(result.current.state.page).toBe(2);
  });

  // TEST-URL-011
  it("TEST-URL-011: Reset Filters Helper - clears search q and filters, resets page to 1, while preserving sort/order/pageSize/incidentId", () => {
    mockLocation.search =
      "?q=network&status=triggered,investigating&severity=critical&service=auth-gateway&sort=severity&order=asc&page=4&pageSize=50&incidentId=INC-1042";
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current.resetFilters();
    });

    // Filters and search cleared, page reset to 1
    expect(result.current.state.q).toBe("");
    expect(result.current.state.status).toEqual([]);
    expect(result.current.state.severity).toEqual([]);
    expect(result.current.state.service).toEqual([]);
    expect(result.current.state.page).toBe(1);

    // Non-filter preferences preserved
    expect(result.current.state.sort).toBe("severity");
    expect(result.current.state.order).toBe("asc");
    expect(result.current.state.pageSize).toBe(50);
    expect(result.current.state.incidentId).toBe("INC-1042");
  });

  // TEST-URL-012
  it("TEST-URL-012: QueryObject Output - formats state into GetIncidentsQuery for API client consumption", () => {
    mockLocation.search =
      "?q=timeout&status=investigating,triggered&severity=critical,high&service=payments-api&sort=createdAt&order=asc&page=2&pageSize=50";
    const { result } = renderHook(() => useUrlState());

    const { queryObject } = result.current;

    expect(queryObject.q).toBe("timeout");
    expect(queryObject.status).toBe("investigating,triggered");
    expect(queryObject.severity).toBe("critical,high");
    expect(queryObject.service).toBe("payments-api");
    expect(queryObject.sort).toBe("createdAt");
    expect(queryObject.order).toBe("asc");
    expect(queryObject.page).toBe(2);
    expect(queryObject.pageSize).toBe(50);
  });

  it("clearAll() resets all parameters back to DEFAULT_URL_STATE", () => {
    mockLocation.search =
      "?q=test&status=resolved&sort=severity&order=asc&page=3&pageSize=100&incidentId=INC-9999";
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.state).toEqual(DEFAULT_URL_STATE);
    expect(mockLocation.search).toBe("");
  });
});
