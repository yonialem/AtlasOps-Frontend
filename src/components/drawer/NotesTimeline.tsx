/**
 * ============================================================================
 * AtlasOps Incident Management Console - Notes Timeline Component
 * ============================================================================
 * File: src/components/drawer/NotesTimeline.tsx
 * Chronological feed of investigation notes in ascending order with author
 * attribution, relative timestamps, and strict XSS-safe text rendering.
 */

import { useMemo } from "react";
import { MessageSquare, Clock } from "lucide-react";
import { IncidentNote } from "../../contracts/incident.types.ts";
import { formatRelativeTime } from "../incidents/timeUtils.ts";

export interface NotesTimelineProps {
  notes: IncidentNote[];
}

export function NotesTimeline({ notes }: NotesTimelineProps) {
  // Sort notes in strictly ascending chronological order
  const sortedNotes = useMemo(() => {
    return [...notes].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [notes]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  if (sortedNotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-dashed border-border-subtle bg-surface-elevated/20 text-center">
        <MessageSquare className="w-8 h-8 text-txt-muted mb-2" aria-hidden="true" />
        <p className="text-xs text-txt-secondary font-medium">
          No investigation notes recorded yet.
        </p>
        <p className="text-[11px] text-txt-muted mt-0.5">
          Post the first update or log snippet using the form below.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" role="feed" aria-label="Investigation Notes Timeline">
      {sortedNotes.map((note) => (
        <article
          key={note.id}
          className="p-3.5 rounded-lg bg-surface-elevated/60 border border-border-subtle text-xs space-y-2 transition-colors"
        >
          {/* Note Author & Timestamp Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {note.author.avatarUrl ? (
                <img
                  src={note.author.avatarUrl}
                  alt={note.author.name}
                  className="w-5 h-5 rounded-full border border-border-subtle object-cover shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {getInitials(note.author.name)}
                </div>
              )}
              <span className="font-semibold text-txt-primary truncate">
                {note.author.name}
              </span>
            </div>

            <div
              className="flex items-center gap-1 text-[11px] text-txt-secondary shrink-0 font-mono"
              title={note.createdAt}
            >
              <Clock className="w-3 h-3 text-txt-muted" aria-hidden="true" />
              <span>{formatRelativeTime(note.createdAt)}</span>
            </div>
          </div>

          {/* Safe Plain Text Message with Whitespace Preservation */}
          <p className="text-txt-primary whitespace-pre-wrap font-sans text-xs leading-relaxed break-words pl-7">
            {note.message}
          </p>
        </article>
      ))}
    </div>
  );
}

export default NotesTimeline;
