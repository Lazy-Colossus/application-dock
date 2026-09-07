// Shared types for the Listies app. Mirrors backend/app/schemas/listies.py —
// snake_case field names are the API contract, not an oversight.

export type ColumnType = "text" | "number" | "date" | "place" | "place_group";

/**
 * A snapshot of somewhere, as Google Places returned it — not a reference.
 * Nothing is re-fetched, so a sheet still reads correctly if the key is gone.
 */
export interface Place {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * A named, coloured bucket a row's places belong to (Story 4.6). Groups live on
 * the tab; a `place_group` cell stores only the group's `id`, so recolouring or
 * renaming a group updates every pin without touching a cell.
 */
export interface PlaceGroup {
  id: string;
  name: string;
  // `#rrggbb`, matching the tab-colour pattern.
  color: string;
}

// A cell holds a string (text / date), a number, a place, or nothing at all.
// `null` means "not filled in", which is distinct from 0 or "".
export type CellValue = string | number | Place | null;

export function isPlace(value: CellValue): value is Place {
  return typeof value === "object" && value !== null && "place_id" in value;
}

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  order: number;
}

export interface Row {
  id: string;
  order: number;
  // Keyed by column id, never by index or name.
  cells: Record<string, CellValue>;
  created_at: string;
  updated_at: string;
}

export interface Tab {
  id: string;
  name: string;
  order: number;
  // `#rrggbb`, or null when the tab has no accent. Optional so a document
  // written before colours still satisfies the type.
  color?: string | null;
  // The tab's place groups (Story 4.6). Optional and additive: a tab written
  // before groups simply has no key.
  place_groups?: PlaceGroup[];
  columns: Column[];
  rows: Row[];
}

export interface Sheet {
  id: string;
  name: string;
  created_at: string;
  tabs: Tab[];
}

/**
 * A sheet plus its collaboration state, as `GET /sheets/{id}` returns it
 * (Story 5.1). A superset of `Sheet`: a private sheet reports `shared: false`
 * and omits member data; a shared one carries owner/members/rev and
 * `can_manage` (true only for the owner).
 */
export interface SheetView extends Sheet {
  shared: boolean;
  owner?: string | null;
  members?: string[] | null;
  rev?: number | null;
  can_manage?: boolean;
}

export interface SheetSummary {
  id: string;
  name: string;
  tab_count: number;
  row_count: number;
  created_at: string;
  // Collaboration hints for the home list (Story 5.1). Absent/false on a
  // private sheet; a shared sheet names its owner.
  shared?: boolean;
  owner?: string | null;
}

// A column as the user defines it before creation — the id and order are
// minted server-side.
export interface ColumnSpec {
  name: string;
  type: ColumnType;
}
