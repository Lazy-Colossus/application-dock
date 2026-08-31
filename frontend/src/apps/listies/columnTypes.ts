// The column types offered in the UI, in one place so the builder, the header
// menu and the add-column popup cannot drift apart.

import type { ColumnType } from "@/apps/listies/types";

export interface ColumnTypeOption {
  label: string;
  value: ColumnType;
}

const SCALAR_TYPES: ColumnTypeOption[] = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
];

const PLACE_TYPE: ColumnTypeOption = { label: "Place", value: "place" };

/**
 * `place` is offered only when the server has Google Maps configured —
 * otherwise it is a column that can never be filled in.
 */
export function columnTypeOptions(allowPlace: boolean): ColumnTypeOption[] {
  return allowPlace ? [...SCALAR_TYPES, PLACE_TYPE] : SCALAR_TYPES;
}
