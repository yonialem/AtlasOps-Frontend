/**
 * ============================================================================
 * AtlasOps Incident Management Console - Toast Notification Component
 * ============================================================================
 * File: src/components/notifications/Toast.tsx
 * Accessible individual toast notification card supporting auto-dismiss,
 * pause on hover, action retry, and WCAG 2.1 AA compliant live regions.
 */

import { useState, useEffect, useRef } from "react";
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // Default 5000ms
  onRetry?: () => void;
  onDismiss?: () => void;
}

export interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const duration = toast.duration ?? 5000;

  // Auto-dismiss timer with hover pause support
  useEffect(() => {
    if (duration <= 0 || duration === Infinity) return;

    if (isPaused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setTimeout(() => {
      toast.onDismiss?.();
      onDismiss(toast.id);
    }, duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [toast.id, duration, isPaused, toast.onDismiss, onDismiss]);

  const handleManualDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    toast.onDismiss?.();
    onDismiss(toast.id);
  };

  const handleRetryClick = () => {
    if (toast.onRetry) {
      toast.onRetry();
    }
  };

  // WCAG 2.1 AA Live Region Attributes
  const isAssertive = toast.type === "error" || toast.type === "warning";
  const role = isAssertive ? "alert" : "status";
  const ariaLive = isAssertive ? "assertive" : "polite";

  // Visual Icon & Palette mapping
  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />;
      case "info":
      default:
        return <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />;
    }
  };

  const getColorClasses = () => {
    switch (toast.type) {
      case "success":
        return "bg-slate-900 border-emerald-600/70 text-emerald-200 shadow-emerald-950/40";
      case "error":
        return "bg-slate-900 border-red-600/70 text-red-200 shadow-red-950/40";
      case "warning":
        return "bg-slate-900 border-amber-600/70 text-amber-200 shadow-amber-950/40";
      case "info":
      default:
        return "bg-slate-900 border-blue-600/70 text-blue-200 shadow-blue-950/40";
    }
  };

  return (
    <div
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto w-full max-w-sm rounded-lg border p-3.5 shadow-xl transition-all duration-200 flex items-start gap-3 backdrop-blur-md ${getColorClasses()}`}
    >
      {getIcon()}

      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-medium leading-snug break-words">
          {toast.message}
        </p>

        {toast.onRetry && (
          <div className="mt-2">
            <button
              type="button"
              onClick={handleRetryClick}
              className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-red-600 hover:bg-red-500 active:bg-red-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1 focus:ring-offset-slate-900"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleManualDismiss}
        aria-label="Dismiss notification"
        title="Dismiss notification"
        className="p-1 rounded-md text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default Toast;
