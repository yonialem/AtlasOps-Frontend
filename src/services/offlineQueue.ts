/**
 * ============================================================================
 * AtlasOps Incident Management Console - Offline Mutation Queue & Replay Engine
 * ============================================================================
 * File: src/services/offlineQueue.ts
 * LocalStorage FIFO mutation queue storing status transitions, assignee
 * updates, and investigation notes while disconnected. Provides an automatic
 * replay synchronization engine that verifies connectivity, replays actions
 * sequentially, handles 409 version conflicts, and reconciles TanStack Query cache.
 */

import { QueryClient } from "@tanstack/react-query";
import {
  updateIncidentStatus,
  updateIncidentAssignee,
  createIncidentNote,
} from "../api/incidents.ts";
import { incidentKeys } from "../api/keys.ts";
import { queryClient as defaultQueryClient } from "../api/queryClient.ts";
import { fetchWithTimeout, isConflictError, isNetworkError } from "../api/client.ts";

export const QUEUE_STORAGE_KEY = "atlasops_offline_mutation_queue";

export type OfflineMutationType = "UPDATE_STATUS" | "UPDATE_ASSIGNEE" | "CREATE_NOTE";
export type QueuedMutationType = OfflineMutationType;

export interface OfflineMutationItem<T = any> {
  id: string;
  type: OfflineMutationType;
  incidentId: string;
  payload: T;
  timestamp: string;
}
export type QueuedMutation<T = any> = OfflineMutationItem<T>;

export interface ReplayResult {
  total: number;
  succeeded: number;
  conflicts: number;
  failed: number;
}

/**
 * Safe storage helper retrieving localStorage from environment or global window.
 */
function getStorage(): Storage | undefined {
  if (typeof localStorage !== "undefined") return localStorage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return undefined;
}

/**
 * Reads and parses the mutation queue from localStorage.
 * Returns an empty array if storage is empty, inaccessible, or corrupted.
 */
export function getQueue(): OfflineMutationItem[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists the entire queue array into localStorage.
 */
function saveQueue(queue: OfflineMutationItem[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Gracefully handle storage quota exceeded or disabled storage
  }
}

/**
 * Appends a new mutation to the end of the queue (FIFO) and saves to localStorage.
 * Generates a unique UUID and current ISO timestamp.
 */
export function enqueue<T = any>(
  item: Omit<OfflineMutationItem<T>, "id" | "timestamp">
): OfflineMutationItem<T> {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `mut-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const timestamp = new Date().toISOString();

  const newItem: OfflineMutationItem<T> = {
    ...item,
    id,
    timestamp,
  };

  const queue = getQueue();
  queue.push(newItem);
  saveQueue(queue);

  return newItem;
}

/**
 * Removes and returns the first item (FIFO) from the queue.
 */
export function dequeue(): OfflineMutationItem | undefined {
  const queue = getQueue();
  if (queue.length === 0) return undefined;
  const [first, ...rest] = queue;
  saveQueue(rest);
  return first;
}

/**
 * Removes a specific mutation item from the queue by its ID.
 */
export function removeById(id: string): void {
  const queue = getQueue();
  const filtered = queue.filter((item) => item.id !== id);
  saveQueue(filtered);
}

/**
 * Clears all pending mutations from localStorage.
 */
export function clearQueue(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(QUEUE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Returns the current total count of items in the queue.
 */
export function getQueueCount(): number {
  return getQueue().length;
}

/**
 * Replays all queued mutations sequentially in FIFO order.
 * - Dispatches a lightweight connectivity ping to /api/health; aborts if unreachable.
 * - Replays actions sequentially:
 *   - On success: removes from queue and increments succeeded.
 *   - On 409 conflict: removes from queue, increments conflicts, and invalidates incident query.
 *   - On network failure: increments failed, halts loop immediately, preserving remaining items for next reconnect.
 * - On finish: invalidates incident queries and invokes optional toast.
 */
export async function replayQueue(
  queryClient: QueryClient = defaultQueryClient,
  showToast?: (toast: any) => void
): Promise<ReplayResult> {
  const initialQueue = getQueue();
  if (initialQueue.length === 0) {
    return {
      total: 0,
      succeeded: 0,
      conflicts: 0,
      failed: 0,
    };
  }

  // 1. Health Ping Check
  try {
    await fetchWithTimeout("/api/health", { timeoutMs: 3000 });
  } catch {
    // Ping failed: network connection is not ready or server is unreachable.
    // Abort replay without modifying the queue.
    return {
      total: initialQueue.length,
      succeeded: 0,
      conflicts: 0,
      failed: 0,
    };
  }

  let succeeded = 0;
  let conflicts = 0;
  let failed = 0;

  // 2. Sequential FIFO Replay
  // Read current snapshot of items
  const queueItems = [...getQueue()];

  for (const item of queueItems) {
    try {
      if (item.type === "UPDATE_STATUS") {
        await updateIncidentStatus(item.incidentId, item.payload);
      } else if (item.type === "UPDATE_ASSIGNEE") {
        await updateIncidentAssignee(item.incidentId, item.payload);
      } else if (item.type === "CREATE_NOTE") {
        await createIncidentNote(item.incidentId, item.payload);
      }

      // Success: Remove item from storage
      removeById(item.id);
      succeeded++;
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        // Network interruption mid-replay: increment failed, halt immediately and retain remaining items
        failed++;
        break;
      }

      const isConflict =
        isConflictError(err) ||
        (err as { status?: number })?.status === 409 ||
        (err as { code?: string })?.code === "INCIDENT_VERSION_CONFLICT";

      if (isConflict) {
        // Concurrency conflict: stale version cannot be re-applied.
        // Remove item from queue, record conflict, and invalidate incident query.
        removeById(item.id);
        conflicts++;
        queryClient.invalidateQueries({
          queryKey: incidentKeys.detail(item.incidentId),
        });
        continue;
      }

      // Other non-network client/server errors (e.g. 400 validation error)
      removeById(item.id);
      failed++;
    }
  }

  // 3. Cache Invalidation & Reconciliation
  queryClient.invalidateQueries({ queryKey: incidentKeys.all });

  if (succeeded > 0 && showToast) {
    showToast({
      type: "success",
      message: `Reconnected: ${succeeded} offline ${
        succeeded === 1 ? "action" : "actions"
      } synchronized successfully.`,
    });
  }

  return {
    total: initialQueue.length,
    succeeded,
    conflicts,
    failed,
  };
}
