// The ONE justified exception to "all HTTP goes through useApi" (Story 2.2).
// `useApi` is fetch-based and cannot hold a server-push stream open, so the
// live channel uses `EventSource`. It is isolated here so nothing else in the
// app touches `EventSource` directly.
//
// `EventSource` cannot send an Authorization header, so the JWT rides as a
// `?token=` query param — accepted by the events endpoint only (see the
// backend note in routers/shared_notes.py).

export interface NoteChangedEvent {
  type: "note.changed";
  note_id: string;
  rev: number;
  actor: string;
}

export interface MembersChangedEvent {
  type: "members.changed";
  note_id: string;
  members: string[];
}

export type ClosedReason = "removed" | "deleted";

export interface NoteClosedEvent {
  type: "note.closed";
  note_id: string;
  reason: ClosedReason;
  // Present only for reason "removed" — the member who was removed. Everyone
  // subscribed receives the frame, so the client filters on it.
  member?: string;
}

export type NoteEvent =
  | NoteChangedEvent
  | MembersChangedEvent
  | NoteClosedEvent;

export interface NoteEventHandlers {
  onChanged?: (event: NoteChangedEvent) => void;
  onMembersChanged?: (event: MembersChangedEvent) => void;
  onClosed?: (event: NoteClosedEvent) => void;
}

export interface NoteEventsSubscription {
  close(): void;
}

/**
 * Subscribe to a note's live events. Returns a handle whose `close()` tears the
 * stream down — call it on unmount / when leaving the note.
 *
 * SSE comment frames (`: ping`, `: connected`) never reach `onmessage`, so only
 * real `data:` events are dispatched here.
 */
export function useNoteEvents(
  noteId: string,
  token: string,
  handlers: NoteEventHandlers,
): NoteEventsSubscription {
  const url = `/api/shared-notes/notes/${noteId}/events?token=${encodeURIComponent(token)}`;
  const source = new EventSource(url);

  source.onmessage = (message: MessageEvent<string>) => {
    let event: NoteEvent;
    try {
      event = JSON.parse(message.data) as NoteEvent;
    } catch {
      return; // ignore a malformed frame rather than throw in the callback
    }
    switch (event.type) {
      case "note.changed":
        handlers.onChanged?.(event);
        break;
      case "members.changed":
        handlers.onMembersChanged?.(event);
        break;
      case "note.closed":
        handlers.onClosed?.(event);
        break;
    }
  };

  return {
    close: () => source.close(),
  };
}
