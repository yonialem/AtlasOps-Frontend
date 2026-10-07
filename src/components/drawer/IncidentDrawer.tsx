/**
 * ============================================================================
 * AtlasOps Incident Management Console - Incident Drawer Component
 * ============================================================================
 * File: src/components/drawer/IncidentDrawer.tsx
 * Slide-over incident detail panel with accessible dialog semantics, focus
 * trapping, status transitions, assignee management, and investigation notes timeline.
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, RefreshCw, AlertTriangle, Layers } from "lucide-react";
import {
  Incident,
  UserSummary,
  IncidentStatus,
} from "../../contracts/incident.types.ts";
import { getIncident } from "../../api/incidents.ts";
import { listUsers } from "../../api/users.ts";
import { incidentKeys, userKeys } from "../../api/keys.ts";
import { queryClient as defaultQueryClient } from "../../api/queryClient.ts";
import {
  useUpdateIncidentStatus,
  useUpdateIncidentAssignee,
  useCreateIncidentNote,
} from "../../hooks/index.ts";
import { formatRelativeTime } from "../incidents/timeUtils.ts";
import { DrawerHeader } from "./DrawerHeader.tsx";
import { StatusTransitionControl } from "./StatusTransitionControl.tsx";
import { AssigneeSelector } from "./AssigneeSelector.tsx";
import { NotesTimeline } from "./NotesTimeline.tsx";
import { AddNoteForm } from "./AddNoteForm.tsx";

export interface IncidentDrawerProps {
  incidentId: string | null;
  onClose: () => void;
  incident?: Incident;
  isLoading?: boolean;
  isError?: boolean;
  users?: UserSummary[];
  onStatusChange?: (newStatus: string) => Promise<void>;
  onAssigneeChange?: (newAssigneeId: string | null) => Promise<void>;
  onAddNote?: (message: string) => Promise<void>;
}

export function IncidentDrawer({
  incidentId,
  onClose,
  incident: propIncident,
  isLoading: propIsLoading,
  isError: propIsError,
  users: propUsers,
  onStatusChange: propOnStatusChange,
  onAssigneeChange: propOnAssigneeChange,
  onAddNote: propOnAddNote,
}: IncidentDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient(defaultQueryClient);

  const [isLocalStatusPending, setIsLocalStatusPending] = useState<boolean>(false);
  const [isLocalAssigneePending, setIsLocalAssigneePending] = useState<boolean>(false);

  // TanStack Query: fetch incident if not provided via props or seed from cache
  const {
    data: fetchedIncident,
    isLoading: isFetchingIncident,
    isPending: isIncidentPending,
    isError: isIncidentQueryError,
    refetch: refetchIncident,
  } = useQuery(
    {
      queryKey: incidentKeys.detail(incidentId ?? ""),
      queryFn: ({ signal }) => getIncident(incidentId!, signal),
      enabled: Boolean(incidentId),
      initialData: () => {
        if (!incidentId) return undefined;
        const cached = queryClient.getQueryData<Incident>(incidentKeys.detail(incidentId));
        if (cached) return cached;
        if (propIncident) return propIncident;
        const listQueries = queryClient.getQueryCache().findAll({ queryKey: incidentKeys.lists() });
        for (const q of listQueries) {
          const data = q.state.data as { items?: Incident[] } | undefined;
          const found = data?.items?.find((item) => item.id === incidentId);
          if (found) return found;
        }
        return undefined;
      },
      initialDataUpdatedAt: () => Date.now(),
    },
    queryClient
  );

  // TanStack Query: fetch user directory if not provided via props
  const { data: fetchedUsers } = useQuery(
    {
      queryKey: userKeys.list(),
      queryFn: ({ signal }) => listUsers(signal),
      enabled: Boolean(incidentId && !propUsers),
    },
    queryClient
  );

  // Optimistic Mutations
  const statusMutation = useUpdateIncidentStatus(incidentId ?? "");
  const assigneeMutation = useUpdateIncidentAssignee(incidentId ?? "");
  const addNoteMutation = useCreateIncidentNote(incidentId ?? "");

  // Reset mutation and local pending states whenever incidentId changes or modal reopens
  useEffect(() => {
    statusMutation.reset();
    assigneeMutation.reset();
    addNoteMutation.reset();
    setIsLocalStatusPending(false);
    setIsLocalAssigneePending(false);
  }, [incidentId]);

  const activeIncident = fetchedIncident ?? propIncident;
  const isQueryLoading = isFetchingIncident || isIncidentPending;
  const isLoading = propIsLoading ?? (isQueryLoading && !activeIncident);
  const isError = propIsError ?? (isIncidentQueryError && !activeIncident);
  const usersList = propUsers ?? fetchedUsers ?? [];

  const isStatusPending = isLocalStatusPending || statusMutation.isPending;
  const isAssigneePending = isLocalAssigneePending || assigneeMutation.isPending;
  const isNotePending = addNoteMutation.isPending;

  // Focus Trapping and Keyboard Escape Listener
  useEffect(() => {
    if (!incidentId) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
      return Array.from(
        container.querySelectorAll<HTMLElement>("button, a, input, select, textarea, [tabindex]")
      ).filter((element) => {
        return (
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-disabled") !== "true" &&
          element.tabIndex !== -1
        );
      });
    };

    const timer = setTimeout(() => {
      if (drawerRef.current) {
        const focusables = getFocusableElements(drawerRef.current);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          drawerRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!drawerRef.current) return;
        const focusables = getFocusableElements(drawerRef.current);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === "function") {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [incidentId, onClose]);

  const handleStatusTransition = async (targetStatus: IncidentStatus) => {
    if (propOnStatusChange) {
      setIsLocalStatusPending(true);
      try {
        await propOnStatusChange(targetStatus);
      } finally {
        setIsLocalStatusPending(false);
      }
    } else if (incidentId) {
      await statusMutation.mutateAsync(targetStatus);
    }
  };

  const handleAssigneeChange = async (userId: string | null) => {
    if (propOnAssigneeChange) {
      setIsLocalAssigneePending(true);
      try {
        await propOnAssigneeChange(userId);
      } finally {
        setIsLocalAssigneePending(false);
      }
    } else if (incidentId) {
      await assigneeMutation.mutateAsync(userId);
    }
  };

  const handleAddNote = async (message: string) => {
    if (propOnAddNote) {
      await propOnAddNote(message);
    } else if (incidentId) {
      await addNoteMutation.mutateAsync(message);
    }
  };

  // If no incidentId is present, the drawer does not mount
  if (!incidentId) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      {/* Semi-transparent Backdrop Overlay */}
      <div
        data-testid="drawer-backdrop"
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-xl md:max-w-2xl bg-surface border-l border-border-subtle shadow-2xl flex flex-col h-full overflow-hidden focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && !activeIncident ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-txt-secondary gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-400" aria-hidden="true" />
            <h2 id="drawer-title" className="text-sm font-semibold text-txt-primary">
              Loading incident {incidentId}...
            </h2>
          </div>
        ) : isError && !activeIncident ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-400" aria-hidden="true" />
            <h2 id="drawer-title" className="text-sm font-bold text-txt-primary">
              Failed to load incident details
            </h2>
            <p className="text-xs text-txt-secondary max-w-sm">
              The incident could not be retrieved from the server. Please check your network connection.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => refetchIncident()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-elevated hover:bg-slate-700 text-txt-secondary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : activeIncident ? (
          <>
            {/* Header */}
            <DrawerHeader incident={activeIncident} onClose={onClose} />

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Lifecycle Controls */}
              <div className="p-4 rounded-xl bg-surface-elevated/40 border border-border-subtle space-y-4">
                <StatusTransitionControl
                  currentStatus={activeIncident.status}
                  onTransition={handleStatusTransition}
                  isPending={isStatusPending}
                />

                <div className="border-t border-border-subtle/60 pt-4">
                  <AssigneeSelector
                    currentAssignee={activeIncident.assignee}
                    users={usersList}
                    onAssign={handleAssigneeChange}
                    isPending={isAssigneePending}
                  />
                </div>
              </div>

              {/* Metadata Overview Fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-surface-elevated/20 border border-border-subtle text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
                    Service
                  </span>
                  <span className="font-mono text-cyan-300 font-medium truncate block">
                    {activeIncident.service}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
                    Version
                  </span>
                  <span className="font-mono text-txt-primary flex items-center gap-1">
                    <Layers className="w-3 h-3 text-txt-muted" aria-hidden="true" />
                    <span>v{activeIncident.version}</span>
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
                    Created
                  </span>
                  <span
                    className="text-txt-primary flex items-center gap-1 font-mono text-[11px]"
                    title={activeIncident.createdAt}
                  >
                    <Clock className="w-3 h-3 text-txt-muted shrink-0" aria-hidden="true" />
                    <span className="truncate">{formatRelativeTime(activeIncident.createdAt)}</span>
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
                    Updated
                  </span>
                  <span
                    className="text-txt-primary flex items-center gap-1 font-mono text-[11px]"
                    title={activeIncident.updatedAt}
                  >
                    <Clock className="w-3 h-3 text-txt-muted shrink-0" aria-hidden="true" />
                    <span className="truncate">{formatRelativeTime(activeIncident.updatedAt)}</span>
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                  Description
                </label>
                <p className="whitespace-pre-wrap font-sans text-xs text-txt-primary leading-relaxed bg-surface-elevated/30 p-3.5 rounded-xl border border-border-subtle break-words">
                  {activeIncident.description}
                </p>
              </div>

              {/* Chronological Investigation Timeline & Notes */}
              <div className="space-y-3 pt-3 border-t border-border-subtle">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-txt-primary tracking-tight">
                    Investigation Notes ({activeIncident.notes?.length ?? 0})
                  </h3>
                </div>

                <NotesTimeline notes={activeIncident.notes ?? []} />

                <AddNoteForm onSubmit={handleAddNote} isSubmitting={isNotePending} />
              </div>
            </div>
          </>
        ) : !activeIncident ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-400" aria-hidden="true" />
            <h2 id="drawer-title" className="text-sm font-bold text-txt-primary">
              Incident Details Unavailable
            </h2>
            <p className="text-xs text-txt-secondary max-w-sm">
              {typeof navigator !== "undefined" && !navigator.onLine
                ? "You are currently offline and this incident is not yet cached locally."
                : "Incident details could not be found."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-elevated hover:bg-slate-700 text-txt-secondary transition-colors"
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default IncidentDrawer;
