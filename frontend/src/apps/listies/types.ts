// Shared types for the Listies app. Mirrors backend/app/schemas/listies.py —
// snake_case field names are the API contract, not an oversight.

export type ColumnType = "text" | "number" | "date";

// A cell holds a string (text / date), a number, or nothing at all. `null`
// means "not filled in", which is distinct from 0 or "".
export type CellValue = string | number | null;

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
  columns: Column[];
  rows: Row[];
}

export interface Sheet {
  id: string;
  name: string;
  created_at: string;
  tabs: Tab[];
}

export interface SheetSummary {
  id: string;
  name: string;
  tab_count: number;
  row_count: number;
  created_at: string;
}

// A column as the user defines it before creation — the id and order are
// minted server-side.
export interface ColumnSpec {
  name: string;
  type: ColumnType;
}
