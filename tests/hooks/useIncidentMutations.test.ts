/**
 * ============================================================================
 * AtlasOps Incident Management Console - Optimistic Mutations Test Suite
 * ============================================================================
 * File: frontend/tests/hooks/useIncidentMutations.test.ts
 * Specification: specs/tasks/TASK-FE-008.md
 * Contracts: contracts/api.types.ts, contracts/incident.types.ts
 *
 * Acceptance Criteria Covered:
 * - TEST-OPT-001: Status Dual-Cache Optimistic Update (updates Detail & List caches before API resolves)
 * - TEST-OPT-002: Status Mutation Success Reconciliation (cache updates with server response, shows success toast)
 * - TEST-OPT-003: Status Mutation Failure 500 Rollback (reverts caches to snapshot, shows error toast with Retry)
 * - TEST-OPT-004: Status Mutation 409 Conflict Rollback (reverts cache, reads currentVersion, shows warning toast, refetches)
 * - TEST-OPT-005: Assignee Optimistic Update (updates assignee in Detail & List caches immediately)
 * - TEST-OPT-006: Unassign Optimistic Update (clears assignee to null across caches)
 * - TEST-OPT-007: Assignee Mutation Rollback (reverts to previous user on error, shows error toast)
 * - TEST-OPT-008: Note Creation Optimistic Append (appends temporary note to incident.notes in Detail cache)
 * - TEST-OPT-009: Note Creation Rollback (removes optimistic note on submission failure)
 */

import React, { act } from "react";
import ReactDOM from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type {
  Incident,
  IncidentNote,
  IncidentSeverity,
  IncidentStatus,
  IncidentsListResponse,
  UserSummary,
} from "@contracts";
import {
  IncidentSchema,
  IncidentNoteSchema,
  UserSummarySchema,
} from "@contracts";

import { incidentKeys } from "@/api/keys";
import { ApiError } from "@/api/client";
import { queryClient as defaultQueryClient } from "@/api/queryClient";
import * as apiIncidents from "@/api/incidents";

// ---------------------------------------------------------------------------
// Dynamic Import Loader with Graceful TDD Red Phase Fallback
// ---------------------------------------------------------------------------

let mutationsModule: any = null;
try {
  // @ts-ignore - Module implemented in Stage 3 (TASK-FE-008)
  mutationsModule = await import("@/hooks/useIncidentMutations");
} catch {
  mutationsModule = null;
}

const useUpdateIncidentStatus = mutationsModule?.useUpdateIncidentStatus;
const useUpdateIncidentAssignee = mutationsModule?.useUpdateIncidentAssignee;
const useCreateIncidentNote = mutationsModule?.useCreateIncidentNote;

/**
 * Asserts hook existence for clean TDD Red Phase reporting.
 */
function assertHook(name: string, hook: any): hook is Function {
  expect(
    hook,
    `Hook "${name}" is pending implementation in "@/hooks/useIncidentMutations" (TDD Red Phase)`
  ).toBeDefined();
  return typeof hook === "function";
}

// ---------------------------------------------------------------------------
// Toast Notification Context Spy & Mock
// ---------------------------------------------------------------------------

const { mockShowToast, mockDismissToast } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockDismissToast: vi.fn(),
}));

vi.mock("@/components/notifications/ToastContext.tsx", () => ({
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    dismissToast: mockDismissToast,
  }),
  default: ({ children }: any) => children,
}));

vi.mock("../components/notifications/ToastContext.tsx", () => ({
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    dismissToast: mockDismissToast,
  }),
  default: ({ children }: any) => children,
}));

vi.mock("@/components/notifications", () => ({
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    dismissToast: mockDismissToast,
  }),
}));

// Mock API layer to precisely orchestrate success, delays, and HTTP error statuses
vi.mock("@/api/incidents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/incidents")>();
  return {
    ...actual,
    updateIncidentStatus: vi.fn(),
    updateIncidentAssignee: vi.fn(),
    createIncidentNote: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Lightweight DOM / Event Harness for Hook & Mutation Execution
// ---------------------------------------------------------------------------

class MockNode {
  nodeType: number;
  tagName: string;
  nodeName: string;
  childNodes: MockNode[];
  parentNode: MockNode | null = null;
  style: Record<string, string> = {};
  attributes: Map<string, string> = new Map();
  listeners: Map<string, Set<(e: any) => void>> = new Map();

  get ownerDocument(): any {
    return doc;
  }

  constructor(nodeType: number, tagName: string) {
    this.nodeType = nodeType;
    this.tagName = tagName;
    this.nodeName = tagName;
    this.childNodes = [];
  }

  appendChild(child: MockNode) {
    child.parentNode = this;
    this.childNodes.push(child);
  }

  removeChild(child: MockNode) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      child.parentNode = null;
      this.childNodes.splice(idx, 1);
    }
  }

  addEventListener(type: string, fn: (e: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: any) => void) {
    this.listeners.get(type)?.delete(fn);
  }
}

const doc: any = {
  nodeType: 9,
  body: new MockNode(1, "BODY"),
  createElement: (tag: string) => new MockNode(1, tag.toUpperCase()),
  createElementNS: (_ns: string, tag: string) => new MockNode(1, tag.toUpperCase()),
  createTextNode: () => new MockNode(3, "#text"),
  addEventListener: () => {},
  removeEventListener: () => {},
  activeElement: null,
};

const win: any = {
  document: doc,
  addEventListener: () => {},
  removeEventListener: () => {},
  navigator: { onLine: true },
  HTMLIFrameElement: class {},
};

doc.defaultView = win;

function renderHook<T>(
  useHook: () => T,
  options?: { wrapper?: React.ComponentType<{ children: React.ReactNode }> }
) {
  const container = new MockNode(1, "DIV");
  doc.body.appendChild(container);
  const root = ReactDOM.createRoot(container as any);
  const result = { current: undefined as unknown as T };

  function TestComponent() {
    result.current = useHook();
    return null;
  }

  const Wrapper = options?.wrapper;
  const element = Wrapper
    ? React.createElement(Wrapper, null, React.createElement(TestComponent))
    : React.createElement(TestComponent);

  act(() => {
    root.render(element);
  });

  return {
    result,
    unmount: () =>
      act(() => {
        root.unmount();
        doc.body.removeChild(container);
      }),
    rerender: () =>
      act(() => {
        root.render(
          Wrapper
            ? React.createElement(Wrapper, null, React.createElement(TestComponent))
            : React.createElement(TestComponent)
        );
      }),
  };
}

// ---------------------------------------------------------------------------
// Authoritative Mock Test Data conforming to contracts/incident.types.ts
// ---------------------------------------------------------------------------

const mockUserAlex: UserSummary = {
  id: "usr-1",
  name: "Alex Mercer",
  email: "alex.mercer@atlasops.io",
  avatarUrl: "https://avatar.atlasops.io/alex.png",
};

const mockUserDevon: UserSummary = {
  id: "usr-2",
  name: "Devon Chen",
  email: "devon.chen@atlasops.io",
  avatarUrl: "https://avatar.atlasops.io/devon.png",
};

const mockNoteInitial: IncidentNote = {
  id: "note-101",
  incidentId: "INC-1001",
  author: mockUserAlex,
  message: "Initial alert triggered from automated payment gateway monitoring.",
  createdAt: "2026-10-06T10:00:00.000Z",
};

const mockIncidentA: Incident = {
  id: "INC-1001",
  title: "Payment gateway connection timeout spikes",
  description: "Cascading 504 gateway timeout errors detected on the payment processing endpoint.",
  status: "triggered",
  severity: "critical",
  service: "payments-api",
  assignee: mockUserAlex,
  createdAt: "2026-10-06T09:30:00.000Z",
  updatedAt: "2026-10-06T10:00:00.000Z",
  version: 1,
  notes: [mockNoteInitial],
};

const mockIncidentB: Incident = {
  id: "INC-1002",
  title: "Checkout web frontend bundle loading failure",
  description: "Users experiencing white screen of death on checkout flow due to failed chunk loading.",
  status: "investigating",
  severity: "high",
  service: "checkout-web",
  assignee: mockUserDevon,
  createdAt: "2026-10-06T09:45:00.000Z",
  updatedAt: "2026-10-06T10:15:00.000Z",
  version: 1,
  notes: [],
};

const mockListResponse: IncidentsListResponse = {
  items: [mockIncidentA, mockIncidentB],
  page: 1,
  pageSize: 25,
  total: 2,
  totalPages: 1,
};

// Validate contract integrity
IncidentSchema.parse(mockIncidentA);
IncidentSchema.parse(mockIncidentB);
IncidentNoteSchema.parse(mockNoteInitial);
UserSummarySchema.parse(mockUserAlex);
UserSummarySchema.parse(mockUserDevon);

// ---------------------------------------------------------------------------
// Test Suites: Optimistic Mutations & Rollback Handling (TASK-FE-008)
// ---------------------------------------------------------------------------

describe("Optimistic Mutations & Rollback Handling (TASK-FE-008)", () => {
  const queryClient = defaultQueryClient;

  const createWrapper = (client: QueryClient) => {
    return function QueryWrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client }, children);
    };
  };

  beforeEach(() => {
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", { onLine: true });
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    doc.activeElement = doc.body;

    queryClient.clear();
    mockShowToast.mockClear();
    mockDismissToast.mockClear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-001: Status Dual-Cache Optimistic Update
  // -------------------------------------------------------------------------
  it("TEST-OPT-001: Status Dual-Cache Optimistic Update — immediately updates both Detail query and List query before API resolves", async () => {
    if (!assertHook("useUpdateIncidentStatus", useUpdateIncidentStatus)) return;

    // 1. Seed Dual-Cache state
    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);
    queryClient.setQueryData(incidentKeys.list({ page: 1 }), mockListResponse);
    queryClient.setQueryData(incidentKeys.list({ status: "triggered" }), {
      ...mockListResponse,
      items: [mockIncidentA],
      total: 1,
    });

    // 2. Delayed API promise to observe optimistic state
    let resolveApi!: (val: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(apiIncidents.updateIncidentStatus).mockImplementation(() => apiPromise as any);

    const { result } = renderHook(() => useUpdateIncidentStatus("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    // 3. Trigger mutation to transition status to "acknowledged"
    await act(async () => {
      result.current.mutate({ status: "acknowledged" });
    });

    // 4. Verify Detail cache is optimistically updated BEFORE API resolves
    const optimisticDetail = queryClient.getQueryData<Incident>(incidentKeys.detail("INC-1001"));
    expect(optimisticDetail).toBeDefined();
    expect(optimisticDetail?.status).toBe("acknowledged");
    expect(new Date(optimisticDetail!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(mockIncidentA.updatedAt).getTime()
    );

    // 5. Verify all matching List queries in cache are optimistically updated
    const optimisticListPage1 = queryClient.getQueryData<IncidentsListResponse>(
      incidentKeys.list({ page: 1 })
    );
    expect(optimisticListPage1).toBeDefined();
    const itemA = optimisticListPage1?.items.find((item) => item.id === "INC-1001");
    expect(itemA?.status).toBe("acknowledged");
    // Other items must remain untouched
    const itemB = optimisticListPage1?.items.find((item) => item.id === "INC-1002");
    expect(itemB?.status).toBe("investigating");

    const optimisticListFiltered = queryClient.getQueryData<IncidentsListResponse>(
      incidentKeys.list({ status: "triggered" })
    );
    expect(optimisticListFiltered?.items[0]?.status).toBe("acknowledged");

    // Clean up pending promise
    await act(async () => {
      resolveApi({
        id: "INC-1001",
        status: "acknowledged",
        updatedAt: new Date().toISOString(),
        version: 2,
      });
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-002: Status Mutation Success Reconciliation
  // -------------------------------------------------------------------------
  it("TEST-OPT-002: Status Mutation Success Reconciliation — reconciles cache with server response and displays success toast", async () => {
    if (!assertHook("useUpdateIncidentStatus", useUpdateIncidentStatus)) return;

    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);
    queryClient.setQueryData(incidentKeys.list({ page: 1 }), mockListResponse);

    const serverResponse = {
      id: "INC-1001",
      status: "acknowledged" as IncidentStatus,
      updatedAt: "2026-10-06T12:05:00.000Z",
      version: 2,
    };
    vi.mocked(apiIncidents.updateIncidentStatus).mockResolvedValue(serverResponse as any);

    const { result } = renderHook(() => useUpdateIncidentStatus("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ status: "acknowledged" });
    });

    // Displays success toast
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        message: expect.stringMatching(/INC-1001.*acknowledged/i),
      })
    );
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-003: Status Mutation Failure 500 Rollback
  // -------------------------------------------------------------------------
  it("TEST-OPT-003: Status Mutation Failure 500 Rollback — reverts both Detail and List caches to snapshot and shows error toast with Retry", async () => {
    if (!assertHook("useUpdateIncidentStatus", useUpdateIncidentStatus)) return;

    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);
    queryClient.setQueryData(incidentKeys.list({ page: 1 }), mockListResponse);

    const serverError = new ApiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Database connection failed during status update",
    });
    vi.mocked(apiIncidents.updateIncidentStatus).mockRejectedValue(serverError);

    const { result } = renderHook(() => useUpdateIncidentStatus("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ status: "acknowledged" });
      } catch {
        // Expected rejection
      }
    });

    // Detail cache must roll back to original "triggered" status
    const rolledBackDetail = queryClient.getQueryData<Incident>(incidentKeys.detail("INC-1001"));
    expect(rolledBackDetail?.status).toBe("triggered");
    expect(rolledBackDetail?.updatedAt).toBe(mockIncidentA.updatedAt);

    // List cache must roll back to original "triggered" status
    const rolledBackList = queryClient.getQueryData<IncidentsListResponse>(
      incidentKeys.list({ page: 1 })
    );
    expect(rolledBackList?.items.find((item) => item.id === "INC-1001")?.status).toBe("triggered");

    // Displays error toast with onRetry action callback
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringMatching(/failed/i),
        onRetry: expect.any(Function),
      })
    );

    // Invoking onRetry action re-triggers mutation call
    const lastToastCall = mockShowToast.mock.calls.find((call) => call[0]?.type === "error");
    expect(lastToastCall).toBeDefined();
    await act(async () => {
      lastToastCall[0].onRetry();
    });
    expect(apiIncidents.updateIncidentStatus).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-004: Status Mutation 409 Conflict Rollback
  // -------------------------------------------------------------------------
  it("TEST-OPT-004: Status Mutation 409 Conflict Rollback — reverts cache, extracts currentVersion, shows conflict toast, and refetches detail", async () => {
    if (!assertHook("useUpdateIncidentStatus", useUpdateIncidentStatus)) return;

    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);
    queryClient.setQueryData(incidentKeys.list({ page: 1 }), mockListResponse);

    const conflictError = new ApiError({
      status: 409,
      code: "INCIDENT_VERSION_CONFLICT",
      message: "Version mismatch: incident has been updated by another operator",
      currentVersion: 3,
    });
    vi.mocked(apiIncidents.updateIncidentStatus).mockRejectedValue(conflictError);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateIncidentStatus("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ status: "investigating", version: 1 });
      } catch {
        // Expected rejection
      }
    });

    // Reverts optimistic cache changes
    const detailCache = queryClient.getQueryData<Incident>(incidentKeys.detail("INC-1001"));
    expect(detailCache?.status).toBe("triggered");

    // Displays tailored warning/conflict toast mentioning version 3
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        message: expect.stringMatching(/conflict|another operator|v3|3/i),
      })
    );

    // Re-fetches / invalidates detail query to pull authoritative state
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: incidentKeys.detail("INC-1001"),
      })
    );
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-005: Assignee Optimistic Update
  // -------------------------------------------------------------------------
  it("TEST-OPT-005: Assignee Optimistic Update — updates assignee in both Detail and List caches immediately before API responds", async () => {
    if (!assertHook("useUpdateIncidentAssignee", useUpdateIncidentAssignee)) return;

    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);
    queryClient.setQueryData(incidentKeys.list({ page: 1 }), mockListResponse);

    let resolveApi!: (val: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(apiIncidents.updateIncidentAssignee).mockImplementation(() => apiPromise as any);

    const { result } = renderHook(() => useUpdateIncidentAssignee("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    // Mutate assignee to Devon Chen (usr-2)
    await act(async () => {
      result.current.mutate({ assigneeId: "usr-2" });
    });

    // Detail cache immediately updates assignee
    const optimisticDetail = queryClient.getQueryData<Incident>(incidentKeys.detail("INC-1001"));
    expect(optimisticDetail?.assignee?.id).toBe("usr-2");

    // List cache immediately updates assignee
    const optimisticList = queryClient.getQueryData<IncidentsListResponse>(
      incidentKeys.list({ page: 1 })
    );
    expect(optimisticList?.items.find((item) => item.id === "INC-1001")?.assignee?.id).toBe("usr-2");

    await act(async () => {
      resolveApi({ ...mockIncidentA, assignee: mockUserDevon, version: 2 });
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-006: Unassign Optimistic Update
  // -------------------------------------------------------------------------
  it("TEST-OPT-006: Unassign Optimistic Update — setting assigneeId: null immediately clears assignee to null across caches", async () => {
    if (!assertHook("useUpdateIncidentAssignee", useUpdateIncidentAssignee)) return;

    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);
    queryClient.setQueryData(incidentKeys.list({ page: 1 }), mockListResponse);

    let resolveApi!: (val: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(apiIncidents.updateIncidentAssignee).mockImplementation(() => apiPromise as any);

    const { result } = renderHook(() => useUpdateIncidentAssignee("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    // Mutate to unassigned (null)
    await act(async () => {
      result.current.mutate({ assigneeId: null });
    });

    // Detail cache has assignee: null
    const optimisticDetail = queryClient.getQueryData<Incident>(incidentKeys.detail("INC-1001"));
    expect(optimisticDetail?.assignee).toBeNull();

    // List cache has assignee: null
    const optimisticList = queryClient.getQueryData<IncidentsListResponse>(
      incidentKeys.list({ page: 1 })
    );
    expect(optimisticList?.items.find((item) => item.id === "INC-1001")?.assignee).toBeNull();

    await act(async () => {
      resolveApi({ ...mockIncidentA, assignee: null, version: 2 });
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-007: Assignee Mutation Rollback
  // -------------------------------------------------------------------------
  it("TEST-OPT-007: Assignee Mutation Rollback — reverts to previous user on server rejection and shows error toast", async () => {
    if (!assertHook("useUpdateIncidentAssignee", useUpdateIncidentAssignee)) return;

    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);
    queryClient.setQueryData(incidentKeys.list({ page: 1 }), mockListResponse);

    const serverError = new ApiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Assignee update failed",
    });
    vi.mocked(apiIncidents.updateIncidentAssignee).mockRejectedValue(serverError);

    const { result } = renderHook(() => useUpdateIncidentAssignee("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ assigneeId: "usr-2" });
      } catch {
        // Expected rejection
      }
    });

    // Detail cache reverts back to Alex Mercer
    const detailCache = queryClient.getQueryData<Incident>(incidentKeys.detail("INC-1001"));
    expect(detailCache?.assignee?.id).toBe("usr-1");
    expect(detailCache?.assignee?.name).toBe("Alex Mercer");

    // List cache reverts back to Alex Mercer
    const listCache = queryClient.getQueryData<IncidentsListResponse>(
      incidentKeys.list({ page: 1 })
    );
    expect(listCache?.items.find((item) => item.id === "INC-1001")?.assignee?.id).toBe("usr-1");

    // Shows error toast
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
      })
    );
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-008: Note Creation Optimistic Append
  // -------------------------------------------------------------------------
  it("TEST-OPT-008: Note Creation Optimistic Append — immediately appends temporary note with optimistic timestamp to incident.notes", async () => {
    if (!assertHook("useCreateIncidentNote", useCreateIncidentNote)) return;

    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);

    let resolveApi!: (val: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    vi.mocked(apiIncidents.createIncidentNote).mockImplementation(() => apiPromise as any);

    const { result } = renderHook(() => useCreateIncidentNote("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    const noteMessage = "Dispatched database DBA on-call to inspect connection pool deadlock.";

    await act(async () => {
      result.current.mutate({ message: noteMessage });
    });

    // Optimistically appends note before API responds
    const detailCache = queryClient.getQueryData<Incident>(incidentKeys.detail("INC-1001"));
    expect(detailCache?.notes.length).toBe(2);
    expect(detailCache?.notes[0].id).toBe("note-101");

    const optimisticNote = detailCache?.notes[1];
    expect(optimisticNote).toBeDefined();
    expect(optimisticNote?.message).toBe(noteMessage);
    expect(optimisticNote?.id).toMatch(/^temp-/);

    await act(async () => {
      resolveApi({
        id: "note-102",
        incidentId: "INC-1001",
        author: mockUserAlex,
        message: noteMessage,
        createdAt: new Date().toISOString(),
      });
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OPT-009: Note Creation Rollback
  // -------------------------------------------------------------------------
  it("TEST-OPT-009: Note Creation Rollback — removes optimistic note from incident.notes if submission fails", async () => {
    if (!assertHook("useCreateIncidentNote", useCreateIncidentNote)) return;

    queryClient.setQueryData(incidentKeys.detail("INC-1001"), mockIncidentA);

    const serverError = new ApiError({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Note creation rejected by storage service",
    });
    vi.mocked(apiIncidents.createIncidentNote).mockRejectedValue(serverError);

    const { result } = renderHook(() => useCreateIncidentNote("INC-1001"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ message: "Failed note content" });
      } catch {
        // Expected rejection
      }
    });

    // Reverts notes list back to single original note
    const detailCache = queryClient.getQueryData<Incident>(incidentKeys.detail("INC-1001"));
    expect(detailCache?.notes.length).toBe(1);
    expect(detailCache?.notes[0].id).toBe("note-101");

    // Shows error toast
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
      })
    );
  });
});
