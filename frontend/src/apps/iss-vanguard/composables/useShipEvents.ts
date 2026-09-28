// The ONE justified exception to "all HTTP goes through useApi" in this app:
// `useApi` is fetch-based and cannot hold a server-push stream open. Kept here
// so nothing else touches `EventSource`. The JWT rides as `?token=` because an
// `EventSource` cannot send an Authorization header.

export interface ShipChangedEvent {
  type: "ship.changed";
  ship_id: string;
  rev: number;
  actor: string;
}

export interface MembersChangedEvent {
  type: "members.changed";
  ship_id: string;
  members: string[];
}

export interface ShipClosedEvent {
  type: "ship.closed";
  ship_id: string;
  reason: "removed" | "joined";
  // Everyone on the stream gets the frame; only this member's client moves ship.
  member: string;
}

export type ShipEvent =
  | ShipChangedEvent
  | MembersChangedEvent
  | ShipClosedEvent;

export interface ShipEventHandlers {
  onChanged?: (event: ShipChangedEvent) => void;
  onMembersChanged?: (event: MembersChangedEvent) => void;
  onClosed?: (event: ShipClosedEvent) => void;
}

export interface ShipEventsSubscription {
  close(): void;
}

export function useShipEvents(
  token: string,
  handlers: ShipEventHandlers,
): ShipEventsSubscription {
  const source = new EventSource(
    `/api/iss-vanguard/ship/events?token=${encodeURIComponent(token)}`,
  );

  source.onmessage = (message: MessageEvent<string>) => {
    let event: ShipEvent;
    try {
      event = JSON.parse(message.data) as ShipEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case "ship.changed":
        handlers.onChanged?.(event);
        break;
      case "members.changed":
        handlers.onMembersChanged?.(event);
        break;
      case "ship.closed":
        handlers.onClosed?.(event);
        break;
    }
  };

  return { close: () => source.close() };
}
