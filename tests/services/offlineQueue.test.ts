/**
 * ============================================================================
 * AtlasOps Incident Management Console - Offline Mutation Queue Test Suite
 * ============================================================================
 * File: frontend/tests/services/offlineQueue.test.ts
 * Specification: specs/tasks/TASK-FE-009.md
 * Contracts: contracts/api.types.ts, contracts/incident.types.ts
 *
 * Acceptance Criteria Covered:
 * - TEST-OFFLINE-005: Enqueue Mutation to LocalStorage (writes to atlasops_offline_mutation_queue)
 * - TEST-OFFLINE-006: FIFO Dequeue Order (dequeues first item added in strict FIFO sequence)
 * - TEST-OFFLINE-007: Replay Engine Sequential Processing (replays queued items in order, calls APIs, removes successes)
 * - TEST-OFFLINE-008: Replay Engine Conflict Handling (removes 409 conflicting item, increments count, invalidates cache)
 * - TEST-OFFLINE-009: Replay Engine Abort on Network Failure (halts replay immediately on health ping or mid-replay disconnect)
 * - TEST-OFFLINE-010: Query Cache Invalidation on Replay Finish (invalidates ["incidents"] query cache on replay completion)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import * as apiIncidents from "@/api/incidents";
import * as apiClient from "@/api/client";
import type {
  Incident,
  IncidentStatus,
  UserSummary,
  UpdateIncidentStatusResponse,
  IncidentNote,
} from "@contracts";

// ---------------------------------------------------------------------------
// Dynamic Import Loader with Graceful TDD Red Phase Fallback
// ---------------------------------------------------------------------------

let offlineQueueModule: any = null;
try {
  // @ts-ignore - Module implemented in Stage 3 (TASK-FE-009)
  offlineQueueModule = await import("@/services/offlineQueue");
} catch {
  try {
    // @ts-ignore - Fallback barrel export check
    offlineQueueModule = await import("@/services");
  } catch {
    offlineQueueModule = null;
  }
}

export const QUEUE_STORAGE_KEY: string =
  offlineQueueModule?.QUEUE_STORAGE_KEY ?? "atlasops_offline_mutation_queue";

const enqueue = offlineQueueModule?.enqueue;
const dequeue = offlineQueueModule?.dequeue;
const getQueue = offlineQueueModule?.getQueue;
const removeById = offlineQueueModule?.removeById;
const clearQueue = offlineQueueModule?.clearQueue;
const getQueueCount = offlineQueueModule?.getQueueCount;
const replayQueue = offlineQueueModule?.replayQueue;

/**
 * Asserts function existence for clean TDD Red Phase reporting.
 */
function assertFunction(name: string, fn: any): fn is Function {
  expect(
    fn,
    `Function "${name}" is pending implementation in "@/services/offlineQueue" (TDD Red Phase)`
  ).toBeDefined();
  return typeof fn === "function";
}

// ---------------------------------------------------------------------------
// Types & Data Contracts
// ---------------------------------------------------------------------------

export type QueuedMutationType = "UPDATE_STATUS" | "UPDATE_ASSIGNEE" | "CREATE_NOTE";

export interface QueuedMutation {
  id: string;
  type: QueuedMutationType;
  incidentId: string;
  payload: any;
  timestamp: string;
}

export interface ReplayResult {
  total: number;
  succeeded: number;
  conflicts: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Mock Storage Harness for LocalStorage
// ---------------------------------------------------------------------------

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

// Mock API layer
vi.mock("@/api/incidents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/incidents")>();
  return {
    ...actual,
    updateIncidentStatus: vi.fn(),
    updateIncidentAssignee: vi.fn(),
    createIncidentNote: vi.fn(),
  };
});

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mock Test Fixtures
// ---------------------------------------------------------------------------

const mockUserAlex: UserSummary = {
  id: "usr-1",
  name: "Alex Mercer",
  email: "alex.mercer@atlasops.io",
  avatarUrl: "https://avatar.atlasops.io/alex.png",
};

const mockStatusResponse: UpdateIncidentStatusResponse = {
  id: "INC-1001",
  status: "acknowledged",
  updatedAt: "2026-10-06T12:00:00.000Z",
  version: 2,
};

const mockIncidentResponse: Incident = {
  id: "INC-1001",
  title: "Elevated connection pool latency",
  description: "Primary database pool latency exceeded 500ms threshold.",
  status: "investigating",
  severity: "critical",
  service: "payments-api",
  assignee: mockUserAlex,
  createdAt: "2026-10-06T11:00:00.000Z",
  updatedAt: "2026-10-06T12:00:00.000Z",
  version: 2,
  tags: ["database"],
  notes: [],
};

const mockNoteResponse: IncidentNote = {
  id: "note-101",
  incidentId: "INC-1001",
  author: mockUserAlex,
  message: "DBA on-call engaged to inspect connection pool locks.",
  createdAt: "2026-10-06T12:05:00.000Z",
};

// ---------------------------------------------------------------------------
// Test Suite: Offline Mutation Queue & Replay Engine
// ---------------------------------------------------------------------------

describe("Offline Mutation Queue & Replay Engine (TASK-FE-009)", () => {
  let mockStorage: MockStorage;
  let queryClient: QueryClient;

  beforeEach(() => {
    mockStorage = new MockStorage();
    (globalThis as any).window = globalThis;
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", {
        value: mockStorage,
        writable: true,
        configurable: true,
      });
    }

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();

    // Default: health ping succeeds
    vi.mocked(apiClient.fetchWithTimeout).mockImplementation(async (endpoint: string) => {
      if (endpoint.includes("/health")) {
        return { status: "ok" } as any;
      }
      return {} as any;
    });

    // Default global fetch fallback in case fetch() is used directly
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    }) as any;

    vi.mocked(apiIncidents.updateIncidentStatus).mockResolvedValue(mockStatusResponse);
    vi.mocked(apiIncidents.updateIncidentAssignee).mockResolvedValue(mockIncidentResponse);
    vi.mocked(apiIncidents.createIncidentNote).mockResolvedValue(mockNoteResponse);
  });

  afterEach(() => {
    mockStorage.clear();
  });

  // -------------------------------------------------------------------------
  // TEST-OFFLINE-005: Enqueue Mutation to LocalStorage
  // -------------------------------------------------------------------------
  describe("TEST-OFFLINE-005: Enqueue Mutation to LocalStorage", () => {
    it("writes valid JSON array under atlasops_offline_mutation_queue key with generated id and timestamp", () => {
      if (!assertFunction("enqueue", enqueue)) return;

      const created = enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "acknowledged", version: 1 },
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(typeof created.id).toBe("string");
      expect(created.id.length).toBeGreaterThan(0);
      expect(created.type).toBe("UPDATE_STATUS");
      expect(created.incidentId).toBe("INC-1001");
      expect(created.payload).toEqual({ status: "acknowledged", version: 1 });
      expect(created.timestamp).toBeDefined();
      expect(new Date(created.timestamp).toISOString()).toBe(created.timestamp);

      // Verify localStorage persistence
      const rawStored = mockStorage.getItem(QUEUE_STORAGE_KEY);
      expect(rawStored).not.toBeNull();
      const parsedQueue = JSON.parse(rawStored!);
      expect(Array.isArray(parsedQueue)).toBe(true);
      expect(parsedQueue.length).toBe(1);
      expect(parsedQueue[0]).toEqual(created);
    });

    it("appends multiple mutations sequentially to the end of the stored queue", () => {
      if (!assertFunction("enqueue", enqueue)) return;

      const item1 = enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "investigating", version: 1 },
      });

      const item2 = enqueue({
        type: "UPDATE_ASSIGNEE",
        incidentId: "INC-1001",
        payload: { assigneeId: "usr-1" },
      });

      const item3 = enqueue({
        type: "CREATE_NOTE",
        incidentId: "INC-1001",
        payload: { message: "Dispatched DBA on-call." },
      });

      const rawStored = mockStorage.getItem(QUEUE_STORAGE_KEY);
      const parsedQueue = JSON.parse(rawStored!);
      expect(parsedQueue.length).toBe(3);
      expect(parsedQueue[0].id).toBe(item1.id);
      expect(parsedQueue[1].id).toBe(item2.id);
      expect(parsedQueue[2].id).toBe(item3.id);
      expect(parsedQueue[0].type).toBe("UPDATE_STATUS");
      expect(parsedQueue[1].type).toBe("UPDATE_ASSIGNEE");
      expect(parsedQueue[2].type).toBe("CREATE_NOTE");
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OFFLINE-006: FIFO Dequeue Order
  // -------------------------------------------------------------------------
  describe("TEST-OFFLINE-006: FIFO Dequeue Order", () => {
    it("dequeues mutations in exact first-in, first-out sequence and updates localStorage", () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("dequeue", dequeue)) return;

      const firstAdded = enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "acknowledged", version: 1 },
      });

      const secondAdded = enqueue({
        type: "UPDATE_ASSIGNEE",
        incidentId: "INC-1001",
        payload: { assigneeId: "usr-2" },
      });

      const thirdAdded = enqueue({
        type: "CREATE_NOTE",
        incidentId: "INC-1001",
        payload: { message: "Root cause found: connection pool exhaustion." },
      });

      // 1st dequeue -> returns firstAdded
      const dequeued1 = dequeue();
      expect(dequeued1).toEqual(firstAdded);
      let stored = JSON.parse(mockStorage.getItem(QUEUE_STORAGE_KEY)!);
      expect(stored.length).toBe(2);
      expect(stored[0].id).toBe(secondAdded.id);

      // 2nd dequeue -> returns secondAdded
      const dequeued2 = dequeue();
      expect(dequeued2).toEqual(secondAdded);
      stored = JSON.parse(mockStorage.getItem(QUEUE_STORAGE_KEY)!);
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe(thirdAdded.id);

      // 3rd dequeue -> returns thirdAdded
      const dequeued3 = dequeue();
      expect(dequeued3).toEqual(thirdAdded);
      stored = JSON.parse(mockStorage.getItem(QUEUE_STORAGE_KEY)!);
      expect(stored.length).toBe(0);

      // 4th dequeue on empty queue -> returns undefined without error
      const dequeued4 = dequeue();
      expect(dequeued4).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Queue Utility Operations (getQueue, removeById, clearQueue, getQueueCount)
  // -------------------------------------------------------------------------
  describe("Queue Storage Utility Operations", () => {
    it("getQueue() returns an empty array when localStorage is empty or corrupted", () => {
      if (!assertFunction("getQueue", getQueue)) return;

      mockStorage.removeItem(QUEUE_STORAGE_KEY);
      expect(getQueue()).toEqual([]);

      mockStorage.setItem(QUEUE_STORAGE_KEY, "invalid-non-json{");
      expect(getQueue()).toEqual([]);

      mockStorage.setItem(QUEUE_STORAGE_KEY, "null");
      expect(getQueue()).toEqual([]);
    });

    it("getQueueCount() accurately reflects the number of queued mutations", () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("getQueueCount", getQueueCount)) return;

      expect(getQueueCount()).toBe(0);

      enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "investigating" },
      });
      expect(getQueueCount()).toBe(1);

      enqueue({
        type: "CREATE_NOTE",
        incidentId: "INC-1001",
        payload: { message: "Note text" },
      });
      expect(getQueueCount()).toBe(2);
    });

    it("removeById() removes targeted item and preserves remaining items", () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("removeById", removeById)) return;
      if (!assertFunction("getQueue", getQueue)) return;

      const item1 = enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "investigating" },
      });
      const item2 = enqueue({
        type: "UPDATE_ASSIGNEE",
        incidentId: "INC-1001",
        payload: { assigneeId: "usr-1" },
      });
      const item3 = enqueue({
        type: "CREATE_NOTE",
        incidentId: "INC-1001",
        payload: { message: "Note" },
      });

      removeById(item2.id);

      const remaining = getQueue();
      expect(remaining.length).toBe(2);
      expect(remaining.map((item: QueuedMutation) => item.id)).toEqual([item1.id, item3.id]);
    });

    it("clearQueue() resets the stored queue to an empty state", () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("clearQueue", clearQueue)) return;
      if (!assertFunction("getQueue", getQueue)) return;

      enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "acknowledged" },
      });
      expect(getQueue().length).toBe(1);

      clearQueue();
      expect(getQueue()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OFFLINE-007: Replay Engine Sequential Processing
  // -------------------------------------------------------------------------
  describe("TEST-OFFLINE-007: Replay Engine Sequential Processing", () => {
    it("replays queued mutations sequentially in FIFO order, dispatches APIs, and dequeues successful items", async () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("replayQueue", replayQueue)) return;
      if (!assertFunction("getQueue", getQueue)) return;

      const executionOrder: string[] = [];

      vi.mocked(apiIncidents.updateIncidentStatus).mockImplementation(async (id, payload) => {
        executionOrder.push(`STATUS:${id}:${payload.status}`);
        return mockStatusResponse;
      });

      vi.mocked(apiIncidents.updateIncidentAssignee).mockImplementation(async (id, payload) => {
        executionOrder.push(`ASSIGNEE:${id}:${payload.assigneeId}`);
        return mockIncidentResponse;
      });

      vi.mocked(apiIncidents.createIncidentNote).mockImplementation(async (id, payload) => {
        executionOrder.push(`NOTE:${id}:${payload.message}`);
        return mockNoteResponse;
      });

      enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "acknowledged", version: 1 },
      });

      enqueue({
        type: "UPDATE_ASSIGNEE",
        incidentId: "INC-1001",
        payload: { assigneeId: "usr-1" },
      });

      enqueue({
        type: "CREATE_NOTE",
        incidentId: "INC-1001",
        payload: { message: "Investigating database deadlock." },
      });

      const result: ReplayResult = await replayQueue(queryClient);

      // Verify execution order matches strict FIFO sequence
      expect(executionOrder).toEqual([
        "STATUS:INC-1001:acknowledged",
        "ASSIGNEE:INC-1001:usr-1",
        "NOTE:INC-1001:Investigating database deadlock.",
      ]);

      // All 3 items succeeded and are removed from storage
      expect(result).toEqual({
        total: 3,
        succeeded: 3,
        conflicts: 0,
        failed: 0,
      });

      expect(getQueue()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OFFLINE-008: Replay Engine Conflict Handling (409)
  // -------------------------------------------------------------------------
  describe("TEST-OFFLINE-008: Replay Engine Conflict Handling", () => {
    it("discards conflicting 409 items, increments conflict count, triggers incident invalidation, and processes subsequent items", async () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("replayQueue", replayQueue)) return;
      if (!assertFunction("getQueue", getQueue)) return;

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const conflictError = new ApiError({
        status: 409,
        code: "CONCURRENCY_CONFLICT",
        message: "Incident has been updated by another operator (version mismatch).",
        currentVersion: 3,
      });

      vi.mocked(apiIncidents.updateIncidentStatus).mockRejectedValue(conflictError);
      vi.mocked(apiIncidents.createIncidentNote).mockResolvedValue(mockNoteResponse);

      // 1st mutation will conflict (stale version)
      enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "resolved", version: 1 },
      });

      // 2nd mutation should proceed and succeed
      enqueue({
        type: "CREATE_NOTE",
        incidentId: "INC-1001",
        payload: { message: "Operator attempted resolution during conflict." },
      });

      const result: ReplayResult = await replayQueue(queryClient);

      // Conflicted item is discarded (cannot reapply stale version), valid note succeeds
      expect(result.total).toBe(2);
      expect(result.conflicts).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);

      // Queue is cleared of the discarded conflict and completed note
      expect(getQueue()).toEqual([]);

      // Invalidation was triggered to fetch current server state
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: expect.arrayContaining(["incidents"]),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OFFLINE-009: Replay Engine Abort on Network Failure
  // -------------------------------------------------------------------------
  describe("TEST-OFFLINE-009: Replay Engine Abort on Network Failure", () => {
    it("halts replay immediately without dispatching any mutations if initial health check fails, retaining all items in localStorage", async () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("replayQueue", replayQueue)) return;
      if (!assertFunction("getQueue", getQueue)) return;

      // Mock health ping failure (server unreachable)
      vi.mocked(apiClient.fetchWithTimeout).mockRejectedValue(
        new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Failed to connect to health endpoint" })
      );
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network offline"));

      enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "investigating" },
      });

      enqueue({
        type: "CREATE_NOTE",
        incidentId: "INC-1001",
        payload: { message: "Note pending sync" },
      });

      const result = await replayQueue(queryClient);

      // No incident APIs should be called
      expect(apiIncidents.updateIncidentStatus).not.toHaveBeenCalled();
      expect(apiIncidents.createIncidentNote).not.toHaveBeenCalled();

      // All items must be retained in localStorage for future retry
      expect(getQueue().length).toBe(2);
      expect(result.succeeded).toBe(0);
    });

    it("halts replay immediately when network drops mid-replay, preserving remaining pending mutations in localStorage", async () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("replayQueue", replayQueue)) return;
      if (!assertFunction("getQueue", getQueue)) return;

      const networkCrash = new ApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "Connection dropped during mutation request",
      });

      // Item 1 succeeds
      vi.mocked(apiIncidents.updateIncidentStatus).mockResolvedValue(mockStatusResponse);
      // Item 2 suffers network disconnect
      vi.mocked(apiIncidents.updateIncidentAssignee).mockRejectedValue(networkCrash);
      // Item 3 must NOT be attempted
      vi.mocked(apiIncidents.createIncidentNote).mockResolvedValue(mockNoteResponse);

      const item1 = enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "acknowledged", version: 1 },
      });

      const item2 = enqueue({
        type: "UPDATE_ASSIGNEE",
        incidentId: "INC-1001",
        payload: { assigneeId: "usr-2" },
      });

      const item3 = enqueue({
        type: "CREATE_NOTE",
        incidentId: "INC-1001",
        payload: { message: "This should not be sent while disconnected" },
      });

      const result: ReplayResult = await replayQueue(queryClient);

      expect(apiIncidents.updateIncidentStatus).toHaveBeenCalledTimes(1);
      expect(apiIncidents.updateIncidentAssignee).toHaveBeenCalledTimes(1);
      // Item 3 was halted
      expect(apiIncidents.createIncidentNote).not.toHaveBeenCalled();

      // Item 1 was removed, but item 2 and item 3 are preserved in localStorage
      const remainingQueue = getQueue();
      expect(remainingQueue.length).toBe(2);
      expect(remainingQueue[0].id).toBe(item2.id);
      expect(remainingQueue[1].id).toBe(item3.id);

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // TEST-OFFLINE-010: Query Cache Invalidation on Replay Finish
  // -------------------------------------------------------------------------
  describe("TEST-OFFLINE-010: Query Cache Invalidation on Replay Finish", () => {
    it("invalidates ['incidents'] query cache upon completion of replayQueue to reconcile fresh server state", async () => {
      if (!assertFunction("enqueue", enqueue)) return;
      if (!assertFunction("replayQueue", replayQueue)) return;

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      enqueue({
        type: "UPDATE_STATUS",
        incidentId: "INC-1001",
        payload: { status: "acknowledged", version: 1 },
      });

      await replayQueue(queryClient);

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: expect.arrayContaining(["incidents"]),
        })
      );
    });
  });
});
