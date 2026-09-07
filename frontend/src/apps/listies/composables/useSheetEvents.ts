// The ONE justified exception to "all HTTP goes through useApi" (Story 5.2).
// `useApi` is fetch-based and cannot hold a server-push stream open, so the
// live channel uses `EventSource`. It is isolated here so nothing else in the
// app touches `EventSource` directly.
//
// `EventSource` cannot send an Authorization header, so the JWT rides as a
// `?token=` query param — accepted by the events endpoint only (see the backend
// note in routers/listies.py).

export interface SheetChangedEvent {
  type: "sheet.changed";
  sheet_id: string;
  rev: number;
  actor: string;
}

export interface MembersChangedEvent {
  type: "members.changed";
  sheet_id: string;
  members: string[];
}

export type ClosedReason = "removed" | "unshared" | "deleted";

export interface SheetClosedEvent {
  type: "sheet.closed";
  sheet_id: string;
  reason: ClosedReason;
  // Present only for reason "removed" — the member who was removed.
  member?: string;
}

export type SheetEvent =
  | SheetChangedEvent
  | MembersChangedEvent
  | SheetClosedEvent;

export interface SheetEventHandlers {
  onChanged?: (event: SheetChangedEvent) => void;
  onMembersChanged?: (event: MembersChangedEvent) => void;
  onClosed?: (event: SheetClosedEvent) => void;
}

export interface SheetEventsSubscription {
  close(): void;
}

/**
 * Subscribe to a shared sheet's live events. Returns a handle whose `close()`
 * tears the stream down — call it on unmount / when leaving the sheet.
 *
 * SSE comment frames (`: ping`, `: connected`) never reach `onmessage`, so only
 * real `data:` events are dispatched here.
 */
export function useSheetEvents(
  sheetId: string,
  token: string,
  handlers: SheetEventHandlers,
): SheetEventsSubscription {
  const url = `/api/listies/sheets/${sheetId}/events?token=${encodeURIComponent(token)}`;
  const source = new EventSource(url);

  source.onmessage = (message: MessageEvent<string>) => {
    let event: SheetEvent;
    try {
      event = JSON.parse(message.data) as SheetEvent;
    } catch {
      return; // ignore a malformed frame rather than throw in the callback
    }
    switch (event.type) {
      case "sheet.changed":
        handlers.onChanged?.(event);
        break;
      case "members.changed":
        handlers.onMembersChanged?.(event);
        break;
      case "sheet.closed":
        handlers.onClosed?.(event);
        break;
    }
  };

  return {
    close: () => source.close(),
  };
}
