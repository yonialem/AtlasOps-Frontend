/**
 * ============================================================================
 * AtlasOps Incident Management Console - Create Incident Modal
 * ============================================================================
 * File: src/components/modals/CreateIncidentModal.tsx
 * Accessible dialog modal for incident creation with inline validation,
 * autofocus, focus trapping, offline handling, and dirty form discard guard.
 */

import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, RefreshCw, WifiOff, AlertCircle } from "lucide-react";
import {
  Incident,
  IncidentCreateInput,
  IncidentCreateInputSchema,
  IncidentSeverity,
  InitialIncidentStatus,
  UserSummary,
} from "../../contracts/incident.types.ts";
import { createIncident } from "../../api/incidents.ts";
import { incidentKeys } from "../../api/keys.ts";
import { queryClient as defaultQueryClient } from "../../api/queryClient.ts";
import { useUrlState } from "../../hooks/index.ts";
import { SeverityBadge } from "../incidents/SeverityBadge.tsx";
import { DiscardConfirmModal } from "./DiscardConfirmModal.tsx";

export interface CreateIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  services?: string[];
  availableServices?: string[];
  users?: UserSummary[];
  onSubmit?: (input: IncidentCreateInput) => Promise<Incident>;
  onSuccess?: (incident: Incident) => void;
  isOnline?: boolean;
}

const DEFAULT_SERVICES = [
  "payments-api",
  "checkout-web",
  "auth-service",
  "inventory-api",
  "reporting-cron",
];

export function CreateIncidentModal({
  isOpen,
  onClose,
  services,
  availableServices,
  users = [],
  onSubmit,
  onSuccess,
  isOnline = typeof navigator !== "undefined" ? navigator.onLine : true,
}: CreateIncidentModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const serviceRef = useRef<HTMLSelectElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const queryClient = useQueryClient(defaultQueryClient);
  const { openIncident } = useUrlState();

  // Form Field State
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [severity, setSeverity] = useState<IncidentSeverity>("high");
  const [status, setStatus] = useState<InitialIncidentStatus>("triggered");
  const [service, setService] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);

  // Validation & Error State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showDiscardModal, setShowDiscardModal] = useState<boolean>(false);

  const serviceOptions = availableServices ?? services ?? DEFAULT_SERVICES;
  const usersList = users;

  // Form Dirty Tracking
  const isDirty =
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    service.trim().length > 0 ||
    severity !== "high" ||
    status !== "triggered" ||
    assigneeId !== null;

  // Reset Form State
  const handleReset = () => {
    setTitle("");
    setDescription("");
    setSeverity("high");
    setStatus("triggered");
    setService("");
    setAssigneeId(null);
    setErrors({});
    setServerError(null);
    setIsSubmitting(false);
    setShowDiscardModal(false);
  };

  // Fallback TanStack Query Mutation
  const createMutation = useMutation(
    {
      mutationFn: (input: IncidentCreateInput) => createIncident(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      },
    },
    queryClient
  );

  // Focus Management: Save trigger element, autofocus Title, and restore focus on dismiss
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      titleInputRef.current?.focus();

      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 30);

      return () => {
        clearTimeout(timer);
        if (
          previouslyFocusedRef.current &&
          typeof previouslyFocusedRef.current.focus === "function"
        ) {
          previouslyFocusedRef.current.focus();
        }
      };
    }
  }, [isOpen]);

  // Keyboard Trap & Escape Dismissal
  useEffect(() => {
    if (!isOpen) return;

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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (showDiscardModal) {
          setShowDiscardModal(false);
        } else if (isDirty) {
          setShowDiscardModal(true);
        } else {
          handleReset();
          onClose();
        }
        return;
      }

      if (e.key === "Tab") {
        if (!dialogRef.current || showDiscardModal) return;
        const focusables = getFocusableElements(dialogRef.current);

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
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isDirty, showDiscardModal, onClose]);

  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardModal(true);
    } else {
      handleReset();
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardModal(false);
    handleReset();
    onClose();
  };

  const handleCancelDiscard = () => {
    setShowDiscardModal(false);
    titleInputRef.current?.focus();
  };

  // Change Handlers with Real-Time Validation Feedback & Error Clearing
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (val.length > 0) {
      const check = IncidentCreateInputSchema.shape.title.safeParse(val);
      if (!check.success) {
        setErrors((prev) => ({
          ...prev,
          title: check.error.issues[0]?.message ?? "Invalid title",
        }));
      } else {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.title;
          return next;
        });
      }
    } else if (errors.title) {
      setErrors((prev) => ({
        ...prev,
        title: "Title must contain at least 5 characters.",
      }));
    }
  };

  const handleTitleBlur = () => {
    if (title.length > 0) {
      const check = IncidentCreateInputSchema.shape.title.safeParse(title);
      if (!check.success) {
        setErrors((prev) => ({
          ...prev,
          title: check.error.issues[0]?.message ?? "Invalid title",
        }));
      }
    }
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDescription(val);
    if (val.length > 0) {
      const check = IncidentCreateInputSchema.shape.description.safeParse(val);
      if (!check.success) {
        setErrors((prev) => ({
          ...prev,
          description: check.error.issues[0]?.message ?? "Invalid description",
        }));
      } else {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.description;
          return next;
        });
      }
    } else if (errors.description) {
      setErrors((prev) => ({
        ...prev,
        description: "Description must contain at least 20 characters.",
      }));
    }
  };

  const handleDescriptionBlur = () => {
    if (description.length > 0) {
      const check = IncidentCreateInputSchema.shape.description.safeParse(description);
      if (!check.success) {
        setErrors((prev) => ({
          ...prev,
          description: check.error.issues[0]?.message ?? "Invalid description",
        }));
      }
    }
  };

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setService(val);
    if (val.trim().length > 0) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.service;
        return next;
      });
    } else if (errors.service) {
      setErrors((prev) => ({
        ...prev,
        service: "Service cannot be empty.",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || isSubmitting) return;

    const rawInput = {
      title: title.trim(),
      description: description.trim(),
      severity,
      status,
      service: service.trim(),
      assigneeId: assigneeId ? assigneeId.trim() : null,
    };

    const validationResult = IncidentCreateInputSchema.safeParse(rawInput);
    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validationResult.error.issues) {
        const field = String(issue.path[0] || "");
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);

      // Focus first invalid field
      if (fieldErrors.title) {
        titleInputRef.current?.focus();
      } else if (fieldErrors.description) {
        descriptionRef.current?.focus();
      } else if (fieldErrors.service) {
        serviceRef.current?.focus();
      }
      return;
    }

    setErrors({});
    setServerError(null);
    setIsSubmitting(true);

    try {
      let created: Incident;
      if (onSubmit) {
        created = await onSubmit(validationResult.data);
      } else {
        created = await createMutation.mutateAsync(validationResult.data);
      }

      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      openIncident(created.id);
      handleReset();
      onSuccess?.(created);
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === "object") {
        const fieldErrors = (err as { fieldErrors?: Record<string, string[] | string> }).fieldErrors;
        if (fieldErrors) {
          const mappedErrors: Record<string, string> = {};
          for (const [k, v] of Object.entries(fieldErrors)) {
            if (Array.isArray(v) && v.length > 0) {
              mappedErrors[k] = v[0];
            } else if (typeof v === "string") {
              mappedErrors[k] = v;
            }
          }
          setErrors(mappedErrors);
          if (mappedErrors.title) titleInputRef.current?.focus();
          else if (mappedErrors.description) descriptionRef.current?.focus();
          else if (mappedErrors.service) serviceRef.current?.focus();
        }

        const msg = (err as { message?: string }).message;
        setServerError(msg || "Failed to create incident. Please try again.");
      } else {
        setServerError("An unexpected server error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-incident-title"
      >
        {/* Semi-transparent Backdrop */}
        <div
          data-testid="modal-backdrop"
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
          onClick={handleRequestClose}
          aria-hidden="true"
        />

        {/* Modal Dialog Card */}
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="relative z-10 w-full max-w-xl bg-surface border border-slate-700 rounded-xl shadow-2xl max-h-[92vh] sm:max-h-[88vh] my-auto flex flex-col overflow-hidden focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-subtle bg-surface-elevated/40 shrink-0">
            <div>
              <h2
                id="create-incident-title"
                className="text-lg font-bold text-txt-primary tracking-tight"
              >
                Create New Incident
              </h2>
              <p className="text-xs text-txt-secondary mt-0.5">
                Declare a production incident and initiate team coordination.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Close dialog"
              title="Close dialog"
              className="p-1.5 rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <X className="w-5 h-5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
            {/* Offline Alert Banner */}
            {!isOnline && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-amber-950/80 border border-amber-600 text-amber-200 text-xs flex items-start gap-2.5"
              >
                <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>You are currently offline.</strong> Incident creation requires an active network connection. Your entered data is preserved.
                </span>
              </div>
            )}

            {/* Server Error Alert Banner */}
            {serverError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-950/70 border border-red-700/80 text-red-200 text-xs flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
                  <span>{serverError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setServerError(null)}
                  className="text-red-400 hover:text-red-200 text-[11px] underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Title Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="incident-title"
                  className="text-xs font-semibold text-txt-secondary uppercase tracking-wider"
                >
                  Title <span className="text-red-400">*</span>
                </label>
                <span className="text-[11px] font-mono text-txt-muted">
                  {`${title.length} / 120`}
                </span>
              </div>
              <input
                ref={titleInputRef}
                id="incident-title"
                type="text"
                autoFocus={true}
                value={title}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                placeholder="Enter a descriptive incident title (min 5 chars)..."
                maxLength={120}
                aria-invalid={Boolean(errors.title)}
                aria-label="Title"
                className={`w-full bg-surface-elevated/70 border rounded-lg px-3 py-2 text-xs sm:text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  errors.title ? "border-red-500" : "border-border-subtle"
                }`}
              />
              {errors.title && (
                <p role="alert" className="text-red-400 text-xs mt-1 font-medium">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Severity & Service Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Severity Field */}
              <div>
                <label
                  htmlFor="incident-severity"
                  className="text-xs font-semibold text-txt-secondary uppercase tracking-wider block mb-1"
                >
                  Severity <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="incident-severity"
                    aria-label="Severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                    className="flex-1 bg-surface-elevated/70 border border-border-subtle rounded-lg px-3 py-2 text-xs font-medium text-txt-primary focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <SeverityBadge severity={severity} />
                </div>
              </div>

              {/* Service Field */}
              <div>
                <label
                  htmlFor="incident-service"
                  className="text-xs font-semibold text-txt-secondary uppercase tracking-wider block mb-1"
                >
                  Service <span className="text-red-400">*</span>
                </label>
                <select
                  ref={serviceRef}
                  id="incident-service"
                  aria-label="Service"
                  value={service}
                  onChange={handleServiceChange}
                  aria-invalid={Boolean(errors.service)}
                  className={`w-full bg-surface-elevated/70 border rounded-lg px-3 py-2 text-xs font-medium text-txt-primary focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    errors.service ? "border-red-500" : "border-border-subtle"
                  }`}
                >
                  <option value="">Select a service...</option>
                  {serviceOptions.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </select>
                {errors.service && (
                  <p role="alert" className="text-red-400 text-xs mt-1 font-medium">
                    {errors.service}
                  </p>
                )}
              </div>
            </div>

            {/* Initial Status & Assignee Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Initial Status Field (NOTE: resolved is strictly omitted) */}
              <div>
                <label
                  htmlFor="incident-status"
                  className="text-xs font-semibold text-txt-secondary uppercase tracking-wider block mb-1"
                >
                  Initial Status <span className="text-red-400">*</span>
                </label>
                <select
                  id="incident-status"
                  aria-label="Initial Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as InitialIncidentStatus)}
                  className="w-full bg-surface-elevated/70 border border-border-subtle rounded-lg px-3 py-2 text-xs font-medium text-txt-primary focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="triggered">Triggered</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="investigating">Investigating</option>
                </select>
              </div>

              {/* Assignee Field (Optional) */}
              <div>
                <label
                  htmlFor="incident-assignee"
                  className="text-xs font-semibold text-txt-secondary uppercase tracking-wider block mb-1"
                >
                  Assignee (Optional)
                </label>
                <select
                  id="incident-assignee"
                  aria-label="Assignee"
                  value={assigneeId ?? ""}
                  onChange={(e) => setAssigneeId(e.target.value === "" ? null : e.target.value)}
                  className="w-full bg-surface-elevated/70 border border-border-subtle rounded-lg px-3 py-2 text-xs font-medium text-txt-primary focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {usersList.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="incident-description"
                  className="text-xs font-semibold text-txt-secondary uppercase tracking-wider"
                >
                  Description <span className="text-red-400">*</span>
                </label>
                <span className="text-[11px] font-mono text-txt-muted">
                  {`${description.length} / 2,000`}
                </span>
              </div>
              <textarea
                ref={descriptionRef}
                id="incident-description"
                aria-label="Description"
                rows={4}
                maxLength={2000}
                value={description}
                onChange={handleDescriptionChange}
                onBlur={handleDescriptionBlur}
                placeholder="Provide detailed context, impact assessment, and observed symptoms (min 20 chars)..."
                aria-invalid={Boolean(errors.description)}
                className={`w-full bg-surface-elevated/70 border rounded-lg p-3 text-xs text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-y min-h-[90px] ${
                  errors.description ? "border-red-500" : "border-border-subtle"
                }`}
              />
              {errors.description && (
                <p role="alert" className="text-red-400 text-xs mt-1 font-medium">
                  {errors.description}
                </p>
              )}
            </div>

            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 p-4 sm:p-5 border-t border-border-subtle bg-surface/95 backdrop-blur-sm shrink-0">
              <button
                type="button"
                onClick={handleRequestClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-surface-elevated hover:bg-slate-700 text-txt-secondary hover:text-txt-primary border border-border-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isOnline}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>Create Incident</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Dirty Form Discard Confirmation */}
      <DiscardConfirmModal
        isOpen={showDiscardModal}
        onConfirm={handleConfirmDiscard}
        onCancel={handleCancelDiscard}
      />
    </>
  );
}

export default CreateIncidentModal;
