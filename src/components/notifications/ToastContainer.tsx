/**
 * ============================================================================
 * AtlasOps Incident Management Console - Toast Container Component
 * ============================================================================
 * File: src/components/notifications/ToastContainer.tsx
 * Fixed viewport overlay rendering active toast notification cards.
 */

import { Toast, ToastMessage } from "./Toast.tsx";
import { useToast } from "./ToastContext.tsx";

export interface ToastContainerProps {
  toasts?: ToastMessage[];
  onDismiss?: (id: string) => void;
  className?: string;
}

export function ToastContainer({
  toasts: propToasts,
  onDismiss: propOnDismiss,
  className = "",
}: ToastContainerProps) {
  const context = useToast();
  const activeToasts = propToasts ?? context.toasts;
  const handleDismiss = propOnDismiss ?? context.dismissToast;

  if (activeToasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Notification center"
      className={`fixed bottom-4 right-4 z-[80] flex flex-col gap-2 max-w-sm w-full pointer-events-none p-4 sm:p-0 ${className}`}
    >
      {activeToasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}

export default ToastContainer;
