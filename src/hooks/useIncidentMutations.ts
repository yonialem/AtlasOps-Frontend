/**
 * ============================================================================
 * AtlasOps Incident Management Console - Optimistic Incident Mutations
 * ============================================================================
 * File: src/hooks/useIncidentMutations.ts
 * Dual-cache optimistic mutation hooks for status, assignee, and investigation notes.
 * Enforces atomic snapshots, rollback on failure, concurrency conflict detection (409),
 * and user notifications via ToastContext.
 */

import { useRef } from "react";
import { useMutation, useQueryClient, UseMutationResult } from "@tanstack/react-query";
import {
  Incident,
  IncidentStatus,
  IncidentNote,
  UserSummary,
  IncidentStatusUpdateInput,
  IncidentAssigneeUpdateInput,
  IncidentNoteCreateInput,
} from "../contracts/incident.types.ts";
import { IncidentsListResponse, UpdateIncidentStatusResponse } from "../contracts/api.types.ts";
import {
  updateIncidentStatus,
  updateIncidentAssignee,
  createIncidentNote,
} from "../api/incidents.ts";
import { incidentKeys, userKeys } from "../api/keys.ts";
import { queryClient as defaultQueryClient } from "../api/queryClient.ts";
import { ApiError, isConflictError } from "../api/client.ts";
import { useToast } from "../components/notifications/ToastContext.tsx";
import { enqueue } from "../services/offlineQueue.ts";

export type UpdateStatusVariables =
  | IncidentStatus
  | { status: IncidentStatus; version?: number };

export interface StatusMutationContext {
  previousDetail?: Incident;
  previousLists?: [readonly unknown[], unknown][];
}

/**
 * Optimistic mutation hook for incident status updates.
 * Synchronizes dual caches (Detail & all Lists) with snapshot rollback on failure.
 */
export function useUpdateIncidentStatus(
  incidentId: string
): UseMutationResult<UpdateIncidentStatusResponse | Incident, unknown, UpdateStatusVariables, StatusMutationContext> {
  const queryClient = useQueryClient(defaultQueryClient);
  const { showToast } = useToast();
  const mutationRef = useRef<UseMutationResult<UpdateIncidentStatusResponse | Incident, unknown, UpdateStatusVariables, StatusMutationContext> | null>(null);

  const mutation = useMutation<
    UpdateIncidentStatusResponse | Incident,
    unknown,
    UpdateStatusVariables,
    StatusMutationContext
  >(
    {
      networkMode: "always",
      mutationFn: async (variables: UpdateStatusVariables) => {
        const payload: IncidentStatusUpdateInput =
          typeof variables === "string"
            ? { status: variables }
            : { status: variables.status, version: variables.version };

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const previous = queryClient.getQueryData<Incident>(incidentKeys.detail(incidentId));
          const updated: Incident = {
            id: incidentId,
            title: previous?.title ?? `Incident ${incidentId}`,
            description: previous?.description ?? "",
            severity: previous?.severity ?? "medium",
            service: previous?.service ?? "system",
            assignee: previous?.assignee ?? null,
            notes: previous?.notes ?? [],
            createdAt: previous?.createdAt ?? new Date().toISOString(),
            ...previous,
            status: payload.status,
            updatedAt: new Date().toISOString(),
            version: (previous?.version ?? 1) + 1,
          };
          return updated;
        }

        return updateIncidentStatus(incidentId, payload);
      },
      onMutate: async (variables: UpdateStatusVariables) => {
        const targetStatus: IncidentStatus =
          typeof variables === "string" ? variables : variables.status;

        // If offline, enqueue mutation for background reconnection replay
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const payload: IncidentStatusUpdateInput =
            typeof variables === "string"
              ? { status: variables }
              : { status: variables.status, version: variables.version };
          enqueue({
            type: "UPDATE_STATUS",
            incidentId,
            payload,
          });
        }

        // 1. Cancel in-flight queries to prevent stale data overwriting optimistic update
        await queryClient.cancelQueries({ queryKey: incidentKeys.detail(incidentId) });
        await queryClient.cancelQueries({ queryKey: incidentKeys.lists() });

        // 2. Snapshot previous states
        const previousDetail = queryClient.getQueryData<Incident>(incidentKeys.detail(incidentId));
        const previousLists = queryClient.getQueriesData<unknown>({
          queryKey: incidentKeys.lists(),
        });

        const optimisticUpdatedAt = new Date().toISOString();

        // 3. Optimistically update Detail cache
        if (previousDetail) {
          queryClient.setQueryData<Incident>(incidentKeys.detail(incidentId), {
            ...previousDetail,
            status: targetStatus,
            updatedAt: optimisticUpdatedAt,
          });
        }

        // 4. Optimistically update all matching List queries in cache
        previousLists.forEach(([queryKey, listResponse]) => {
          if (!listResponse) return;

          // Handle array shape
          if (Array.isArray(listResponse)) {
            queryClient.setQueryData<Incident[]>(
              queryKey,
              listResponse.map((item) =>
                item.id === incidentId
                  ? { ...item, status: targetStatus, updatedAt: optimisticUpdatedAt }
                  : item
              )
            );
            return;
          }

          // Handle PaginatedResponse shape
          if (
            typeof listResponse === "object" &&
            "items" in listResponse &&
            Array.isArray((listResponse as IncidentsListResponse).items)
          ) {
            const paginated = listResponse as IncidentsListResponse;
            queryClient.setQueryData<IncidentsListResponse>(queryKey, {
              ...paginated,
              items: paginated.items.map((item) =>
                item.id === incidentId
                  ? { ...item, status: targetStatus, updatedAt: optimisticUpdatedAt }
                  : item
              ),
            });
          }
        });

        return { previousDetail, previousLists };
      },
      onError: (err: unknown, variables, context) => {
        // When offline, do not rollback optimistic updates since mutation was queued
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          showToast({
            type: "info",
            message: "Offline: Status change queued and will synchronize when connection is restored.",
          });
          return;
        }

        // Rollback Detail
        if (context?.previousDetail) {
          queryClient.setQueryData(incidentKeys.detail(incidentId), context.previousDetail);
        }

        // Rollback Lists
        if (context?.previousLists) {
          context.previousLists.forEach(([queryKey, listResponse]) => {
            queryClient.setQueryData(queryKey, listResponse);
          });
        }

        const isConflict =
          isConflictError(err) ||
          (err as { status?: number })?.status === 409 ||
          (err as { code?: string })?.code === "INCIDENT_VERSION_CONFLICT";

        if (isConflict) {
          const currentVersion =
            (err as { currentVersion?: number })?.currentVersion ??
            (err instanceof ApiError ? err.currentVersion : undefined);
          const versionStr = currentVersion !== undefined ? ` (v${currentVersion})` : "";

          showToast({
            type: "warning",
            message: `Update conflict: Incident was updated by another operator${versionStr}. Latest version loaded.`,
            duration: 6000,
          });
          queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
        } else {
          showToast({
            type: "error",
            message: "Failed to update incident status. Click to retry.",
            onRetry: () => {
              mutationRef.current?.mutate(variables);
            },
          });
        }
      },
      onSuccess: (data, variables) => {
        const targetStatus: IncidentStatus =
          typeof variables === "string" ? variables : variables.status;

        if (data && typeof data === "object") {
          queryClient.setQueryData<Incident>(incidentKeys.detail(incidentId), (old) => {
            if (!old) return old;
            return {
              ...old,
              ...data,
            };
          });
        }

        showToast({
          type: "success",
          message: `Incident ${incidentId} status updated to ${targetStatus}.`,
        });
      },
      onSettled: () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
        queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      },
    },
    queryClient
  );

  mutationRef.current = mutation;
  return mutation;
}

export type UpdateAssigneeVariables =
  | string
  | null
  | { assigneeId: string | null };

export interface AssigneeMutationContext {
  previousDetail?: Incident;
  previousLists?: [readonly unknown[], unknown][];
}

/**
 * Optimistic mutation hook for incident assignee reassignment or unassigning.
 * Synchronizes dual caches with snapshot rollback.
 */
export function useUpdateIncidentAssignee(
  incidentId: string
): UseMutationResult<Incident, unknown, UpdateAssigneeVariables, AssigneeMutationContext> {
  const queryClient = useQueryClient(defaultQueryClient);
  const { showToast } = useToast();
  const mutationRef = useRef<UseMutationResult<Incident, unknown, UpdateAssigneeVariables, AssigneeMutationContext> | null>(null);

  const mutation = useMutation<
    Incident,
    unknown,
    UpdateAssigneeVariables,
    AssigneeMutationContext
  >(
    {
      networkMode: "always",
      mutationFn: async (variables: UpdateAssigneeVariables) => {
        const targetAssigneeId =
          variables === null
            ? null
            : typeof variables === "string"
            ? variables
            : variables.assigneeId;
        const payload: IncidentAssigneeUpdateInput = { assigneeId: targetAssigneeId };

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const previous = queryClient.getQueryData<Incident>(incidentKeys.detail(incidentId));
          let resolvedAssignee: UserSummary | null = null;
          if (targetAssigneeId !== null) {
            const cachedUsers = queryClient.getQueryData<UserSummary[]>(userKeys.list());
            const matchedUser = cachedUsers?.find((u) => u.id === targetAssigneeId);
            resolvedAssignee = matchedUser ?? {
              id: targetAssigneeId,
              name: "Assigned (Offline)",
              email: "operator@atlasops.internal",
            };
          }
          const updated: Incident = {
            id: incidentId,
            title: previous?.title ?? `Incident ${incidentId}`,
            description: previous?.description ?? "",
            status: previous?.status ?? "investigating",
            severity: previous?.severity ?? "medium",
            service: previous?.service ?? "system",
            notes: previous?.notes ?? [],
            createdAt: previous?.createdAt ?? new Date().toISOString(),
            ...previous,
            assignee: resolvedAssignee,
            updatedAt: new Date().toISOString(),
            version: (previous?.version ?? 1) + 1,
          };
          return updated;
        }

        return updateIncidentAssignee(incidentId, payload);
      },
      onMutate: async (variables: UpdateAssigneeVariables) => {
        const targetAssigneeId =
          variables === null
            ? null
            : typeof variables === "string"
            ? variables
            : variables.assigneeId;

        // If offline, enqueue mutation for background reconnection replay
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          enqueue({
            type: "UPDATE_ASSIGNEE",
            incidentId,
            payload: { assigneeId: targetAssigneeId },
          });
        }

        // 1. Cancel in-flight queries
        await queryClient.cancelQueries({ queryKey: incidentKeys.detail(incidentId) });
        await queryClient.cancelQueries({ queryKey: incidentKeys.lists() });

        // 2. Snapshot
        const previousDetail = queryClient.getQueryData<Incident>(incidentKeys.detail(incidentId));
        const previousLists = queryClient.getQueriesData<unknown>({
          queryKey: incidentKeys.lists(),
        });

        // 3. Resolve optimistic UserSummary
        let optimisticAssignee: UserSummary | null = null;
        if (targetAssigneeId !== null) {
          const cachedUsers = queryClient.getQueryData<UserSummary[]>(userKeys.list());
          const matchedUser = cachedUsers?.find((u) => u.id === targetAssigneeId);
          if (matchedUser) {
            optimisticAssignee = matchedUser;
          } else {
            optimisticAssignee = {
              id: targetAssigneeId,
              name: "Assigning...",
              email: "operator@atlasops.local",
            };
          }
        }

        const optimisticUpdatedAt = new Date().toISOString();

        // 4. Update Detail cache
        if (previousDetail) {
          queryClient.setQueryData<Incident>(incidentKeys.detail(incidentId), {
            ...previousDetail,
            assignee: optimisticAssignee,
            updatedAt: optimisticUpdatedAt,
          });
        }

        // 5. Update List caches
        previousLists.forEach(([queryKey, listResponse]) => {
          if (!listResponse) return;

          if (Array.isArray(listResponse)) {
            queryClient.setQueryData<Incident[]>(
              queryKey,
              listResponse.map((item) =>
                item.id === incidentId
                  ? { ...item, assignee: optimisticAssignee, updatedAt: optimisticUpdatedAt }
                  : item
              )
            );
            return;
          }

          if (
            typeof listResponse === "object" &&
            "items" in listResponse &&
            Array.isArray((listResponse as IncidentsListResponse).items)
          ) {
            const paginated = listResponse as IncidentsListResponse;
            queryClient.setQueryData<IncidentsListResponse>(queryKey, {
              ...paginated,
              items: paginated.items.map((item) =>
                item.id === incidentId
                  ? { ...item, assignee: optimisticAssignee, updatedAt: optimisticUpdatedAt }
                  : item
              ),
            });
          }
        });

        return { previousDetail, previousLists };
      },
      onError: (err: unknown, variables, context) => {
        // When offline, do not rollback optimistic updates since mutation was queued
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          showToast({
            type: "info",
            message: "Offline: Assignee change queued and will synchronize when connection is restored.",
          });
          return;
        }

        if (context?.previousDetail) {
          queryClient.setQueryData(incidentKeys.detail(incidentId), context.previousDetail);
        }
        if (context?.previousLists) {
          context.previousLists.forEach(([queryKey, listResponse]) => {
            queryClient.setQueryData(queryKey, listResponse);
          });
        }

        const isConflict =
          isConflictError(err) ||
          (err as { status?: number })?.status === 409 ||
          (err as { code?: string })?.code === "INCIDENT_VERSION_CONFLICT";

        if (isConflict) {
          showToast({
            type: "warning",
            message: "Update conflict: Incident assignee was changed by another operator. Latest version loaded.",
            duration: 6000,
          });
          queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
        } else {
          showToast({
            type: "error",
            message: "Failed to update incident assignee. Click to retry.",
            onRetry: () => {
              mutationRef.current?.mutate(variables);
            },
          });
        }
      },
      onSuccess: (data, variables) => {
        const targetAssigneeId =
          variables === null
            ? null
            : typeof variables === "string"
            ? variables
            : variables.assigneeId;

        if (data && typeof data === "object") {
          queryClient.setQueryData<Incident>(incidentKeys.detail(incidentId), (old) => {
            if (!old) return old;
            return {
              ...old,
              ...data,
            };
          });
        }

        const assigneeName =
          data?.assignee?.name ?? (targetAssigneeId === null ? "Unassigned" : "Assigned");

        showToast({
          type: "success",
          message: `Incident ${incidentId} assignee updated to ${assigneeName}.`,
        });
      },
      onSettled: () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
        queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      },
    },
    queryClient
  );

  mutationRef.current = mutation;
  return mutation;
}

export type CreateNoteVariables =
  | string
  | { message: string };

export interface NoteMutationContext {
  previousDetail?: Incident;
  optimisticNote?: IncidentNote;
}

/**
 * Optimistic mutation hook for creating an investigation note on an incident.
 * Appends note optimistically with automatic rollback on error.
 */
export function useCreateIncidentNote(
  incidentId: string
): UseMutationResult<IncidentNote, unknown, CreateNoteVariables, NoteMutationContext> {
  const queryClient = useQueryClient(defaultQueryClient);
  const { showToast } = useToast();
  const mutationRef = useRef<UseMutationResult<IncidentNote, unknown, CreateNoteVariables, NoteMutationContext> | null>(null);

  const mutation = useMutation<
    IncidentNote,
    unknown,
    CreateNoteVariables,
    NoteMutationContext
  >(
    {
      networkMode: "always",
      mutationFn: async (variables: CreateNoteVariables) => {
        const messageText = typeof variables === "string" ? variables : variables.message;
        const payload: IncidentNoteCreateInput = { message: messageText };

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const offlineNote: IncidentNote = {
            id: `note-temp-${Date.now()}`,
            incidentId,
            author: {
              id: "usr-current",
              name: "You (Offline)",
              email: "operator@atlasops.internal",
            },
            message: payload.message,
            createdAt: new Date().toISOString(),
          };
          return offlineNote;
        }

        return createIncidentNote(incidentId, payload);
      },
      onMutate: async (variables: CreateNoteVariables) => {
        const messageText = typeof variables === "string" ? variables : variables.message;

        // If offline, enqueue mutation for background reconnection replay
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          enqueue({
            type: "CREATE_NOTE",
            incidentId,
            payload: { message: messageText },
          });
        }

        // 1. Cancel in-flight queries
        await queryClient.cancelQueries({ queryKey: incidentKeys.detail(incidentId) });

        // 2. Snapshot
        const previousDetail = queryClient.getQueryData<Incident>(incidentKeys.detail(incidentId));

        const optimisticNote: IncidentNote = {
          id: `temp-${Date.now()}`,
          incidentId,
          author: {
            id: "usr-current",
            name: "Current Operator",
            email: "operator@atlasops.local",
          },
          message: messageText,
          createdAt: new Date().toISOString(),
        };

        const optimisticUpdatedAt = new Date().toISOString();

        // 3. Optimistically update Detail cache
        if (previousDetail) {
          queryClient.setQueryData<Incident>(incidentKeys.detail(incidentId), {
            ...previousDetail,
            notes: [...(previousDetail.notes || []), optimisticNote],
            updatedAt: optimisticUpdatedAt,
          });
        }

        return { previousDetail, optimisticNote };
      },
      onError: (_err: unknown, variables, context) => {
        // When offline, do not rollback optimistic updates since mutation was queued
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          showToast({
            type: "info",
            message: "Offline: Investigation note queued and will synchronize when connection is restored.",
          });
          return;
        }

        if (context?.previousDetail) {
          queryClient.setQueryData(incidentKeys.detail(incidentId), context.previousDetail);
        }

        showToast({
          type: "error",
          message: "Failed to add investigation note. Click to retry.",
          onRetry: () => {
            mutationRef.current?.mutate(variables);
          },
        });
      },
      onSuccess: (data) => {
        if (data && typeof data === "object") {
          queryClient.setQueryData<Incident>(incidentKeys.detail(incidentId), (old) => {
            if (!old) return old;
            const existingNotes = old.notes || [];
            const tempReplaced = existingNotes.map((n) =>
              n.id.startsWith("temp-") && n.message === data.message ? data : n
            );
            const exists = tempReplaced.some((n) => n.id === data.id);
            return {
              ...old,
              notes: exists ? tempReplaced : [...tempReplaced, data],
            };
          });
        }

        showToast({
          type: "success",
          message: `Note added to incident ${incidentId}.`,
        });
      },
      onSettled: () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          return;
        }
        queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
      },
    },
    queryClient
  );

  mutationRef.current = mutation;
  return mutation;
}

/**
 * Convenience composite hook returning all optimistic mutations for an incident.
 */
export function useIncidentMutations(incidentId: string) {
  const updateStatus = useUpdateIncidentStatus(incidentId);
  const updateAssignee = useUpdateIncidentAssignee(incidentId);
  const createNote = useCreateIncidentNote(incidentId);

  return {
    updateStatus,
    updateAssignee,
    createNote,
  };
}

export default useIncidentMutations;
