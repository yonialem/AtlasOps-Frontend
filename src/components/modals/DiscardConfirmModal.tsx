/**
 * ============================================================================
 * AtlasOps Incident Management Console - Discard Confirmation Modal
 * ============================================================================
 * File: src/components/modals/DiscardConfirmModal.tsx
 * Accessible confirmation dialog prompted when closing a dirty incident creation form.
 */

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export interface DiscardConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DiscardConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
}: DiscardConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      cancelBtnRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
          return;
        }

        if (e.key === "Tab") {
          if (!dialogRef.current) return;
          const focusables = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>("button, [tabindex]")
          ).filter(
            (el) =>
              !el.hasAttribute("disabled") &&
              el.getAttribute("aria-disabled") !== "true" &&
              el.tabIndex !== -1
          );

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
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ zIndex: 70 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="discard-confirm-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Confirmation Card */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-[71] w-full max-w-md bg-surface border border-slate-700 rounded-xl shadow-2xl p-6 flex flex-col gap-4 focus:outline-none"
        style={{ zIndex: 71 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-950/80 border border-amber-600/50 text-amber-400 shrink-0">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3
              id="discard-confirm-title"
              className="text-base font-bold text-txt-primary"
            >
              Discard unsaved changes?
            </h3>
            <p className="text-xs text-txt-secondary mt-1 leading-relaxed">
              You have entered data in the incident form. If you close now, all unsaved information will be lost.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border-subtle">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-surface-elevated hover:bg-slate-700 text-txt-secondary hover:text-txt-primary border border-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default DiscardConfirmModal;
