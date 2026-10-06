/**
 * ============================================================================
 * AtlasOps Incident Management Console - Toast Context & Provider
 * ============================================================================
 * File: src/components/notifications/ToastContext.tsx
 * React context and hook providing centralized toast notification dispatch,
 * dismissal, and state tracking.
 */

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { ToastMessage, ToastType } from "./Toast.tsx";

export interface ToastOptions {
  type?: ToastType;
  message: string;
  duration?: number;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export type ShowToastInput = Omit<ToastMessage, "id"> | ToastOptions | string;

export interface ToastContextValue {
  toasts: ToastMessage[];
  showToast: (toast: ShowToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts?: () => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback((input: ShowToastInput): string => {
    toastCounter += 1;
    const generatedId = `toast-${Date.now()}-${toastCounter}-${Math.random().toString(36).slice(2, 7)}`;

    let newToast: ToastMessage;

    if (typeof input === "string") {
      newToast = {
        id: generatedId,
        type: "info",
        message: input,
      };
    } else {
      newToast = {
        id: (input as { id?: string }).id || generatedId,
        type: input.type ?? "info",
        message: input.message,
        duration: input.duration,
        onRetry: input.onRetry,
        onDismiss: input.onDismiss,
      };
    }

    setToasts((prev) => [...prev, newToast]);
    return newToast.id;
  }, []);

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      toasts,
      showToast,
      dismissToast,
      clearToasts,
    }),
    [toasts, showToast, dismissToast, clearToasts]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
    </ToastContext.Provider>
  );
}

/**
 * Custom hook to access toast actions and active toast state.
 * Returns safe fallback if invoked outside ToastProvider.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      showToast: () => "",
      dismissToast: () => {},
      clearToasts: () => {},
    };
  }
  return context;
}

export default ToastProvider;
