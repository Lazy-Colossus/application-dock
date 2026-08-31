// Loading the Google Maps JavaScript SDK, once and on demand.
//
// The SDK is the heaviest thing this app pulls in, so it is fetched only when
// someone actually opens a map — never as part of the bundle. The browser key
// comes from the server at runtime (Story 4.1), which is why this takes a key
// rather than reading one from a build-time constant.

/** Only the slice of the SDK the map pane uses. */
export interface MapsApi {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => GoogleMap;
  // Marker is superseded by AdvancedMarkerElement upstream, but that requires
  // a cloud-configured Map ID. Marker needs no setup and still works.
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  LatLngBounds: new () => GoogleBounds;
}

export interface GoogleMap {
  fitBounds: (bounds: GoogleBounds, padding?: number) => void;
  panTo: (position: { lat: number; lng: number }) => void;
  setCenter: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
}

export interface GoogleMarker {
  setMap: (map: GoogleMap | null) => void;
  addListener: (event: string, handler: () => void) => void;
}

export interface GoogleBounds {
  extend: (position: { lat: number; lng: number }) => void;
}

const SDK_URL = "https://maps.googleapis.com/maps/api/js";

interface LoadableMapsApi extends MapsApi {
  /**
   * Present on current SDK builds. With `loading=async`, `google.maps` appears
   * before it is usable — constructing a `Map` too early throws — and awaiting
   * a library is the supported way to wait for it to be ready.
   */
  importLibrary?: (name: string) => Promise<unknown>;
}

interface MapsWindow extends Window {
  google?: { maps?: LoadableMapsApi };
}

let pending: Promise<MapsApi> | null = null;

function existing(): LoadableMapsApi | null {
  return (window as MapsWindow).google?.maps ?? null;
}

export function loadMapsSdk(browserKey: string): Promise<MapsApi> {
  const already = existing();
  if (already) return Promise.resolve(already);

  if (!browserKey) {
    return Promise.reject(
      new Error("No Google Maps browser key is configured on this server"),
    );
  }

  // One shared promise: several cells opening a map must not each inject a
  // script tag.
  if (pending) return pending;

  pending = new Promise<MapsApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${SDK_URL}?key=${encodeURIComponent(browserKey)}&loading=async`;
    script.async = true;

    script.onload = () => {
      const api = existing();
      if (!api) {
        // The script can load and still leave nothing behind — a rejected or
        // wrongly restricted key does exactly this.
        pending = null;
        reject(
          new Error("Google Maps could not be loaded — check the browser key"),
        );
        return;
      }

      if (typeof api.importLibrary !== "function") {
        resolve(api);
        return;
      }

      // Wait for the SDK to be ready, not merely present.
      api
        .importLibrary("maps")
        .then(() => resolve(existing() ?? api))
        .catch(() => {
          pending = null;
          reject(new Error("Google Maps could not be loaded"));
        });
    };

    script.onerror = () => {
      // Clear the cache so a later attempt can retry rather than replaying
      // the same rejection forever.
      pending = null;
      reject(new Error("Google Maps could not be loaded"));
    };

    document.head.appendChild(script);
  });

  return pending;
}
