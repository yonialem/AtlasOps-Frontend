/**
 * ============================================================================
 * AtlasOps Incident Management Console - Add Note Form Component
 * ============================================================================
 * File: src/components/drawer/AddNoteForm.tsx
 * Investigation note creation form with validation, character counter (5,000 chars),
 * loading spinner, and draft preservation on failure with error banner.
 */

import { useState } from "react";
import { Send, AlertCircle, RefreshCw } from "lucide-react";

export interface AddNoteFormProps {
  onSubmit: (message: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function AddNoteForm({ onSubmit, isSubmitting = false }: AddNoteFormProps) {
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [localPending, setLocalPending] = useState<boolean>(false);

  const pending = isSubmitting || localPending;
  const isWhitespaceOnly = message.trim().length === 0;
  const isOverLimit = message.length > 5000;
  const isSubmitDisabled = isWhitespaceOnly || isOverLimit || pending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;

    setError(null);
    setLocalPending(true);

    try {
      await onSubmit(message.trim());
      // Clear draft message only upon successful submission
      setMessage("");
    } catch (err: unknown) {
      // Draft remains intact in the textarea upon error
      setError(
        err instanceof Error
          ? err.message
          : "Failed to post investigation note. Please try again."
      );
    } finally {
      setLocalPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-4">
      {/* Error Banner with role="alert" */}
      {error && (
        <div
          role="alert"
          className="p-2.5 rounded-lg bg-red-950/70 border border-red-700/80 text-red-200 text-xs flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200 text-[11px] font-mono shrink-0 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Textarea Input */}
      <div className="relative">
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (error) setError(null);
          }}
          disabled={pending}
          placeholder="Add investigation note or paste logs here..."
          aria-label="Add investigation note"
          rows={3}
          maxLength={5000}
          className="w-full bg-surface-elevated/70 border border-border-subtle rounded-lg p-3 text-xs text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 transition-colors resize-y min-h-[80px]"
        />
      </div>

      {/* Form Controls: Character Counter & Submit Button */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[11px] font-mono ${
            isOverLimit ? "text-red-400 font-bold" : "text-txt-muted"
          }`}
        >
          {`${message.length.toLocaleString()} / 5,000`}
        </span>

        <button
          type="submit"
          onClick={(e) => handleSubmit(e)}
          disabled={isSubmitDisabled}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        >
          {pending ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>Post Note</span>
        </button>
      </div>
    </form>
  );
}

export default AddNoteForm;
