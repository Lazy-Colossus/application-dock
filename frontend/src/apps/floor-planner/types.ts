export type Shape = "rectangle" | "round" | "oval" | "egg" | "custom";

export type Colour =
  | "white"
  | "black"
  | "grey"
  | "beige"
  | "brown"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export type Rotation = 0 | 90 | 180 | 270;

export type Mode = "draw" | "furniture" | "arrange";

export type SaveState = "saving" | "unsaved" | "saved";

export interface Label {
  id: string;
  text: string;
  col: number;
  row: number;
}

export interface Furniture {
  id: string;
  name: string;
  colour: Colour;
  note: string;
  shape: Shape;
  width_cm: number;
  depth_cm: number;
  cells: string[] | null;
}

export interface Placement {
  furniture_id: string;
  x_cm: number;
  y_cm: number;
  rotation: Rotation;
}

export interface Layout {
  id: string;
  name: string;
  placements: Placement[];
}

/** One row of the apartment switcher. */
export interface ApartmentSummary {
  id: string;
  name: string;
  owner: string;
  members: string[];
  is_owner: boolean;
  /** ISO 8601; null for an apartment untouched since before Story 1.5. */
  updated_at: string | null;
}

export interface Apartment extends ApartmentSummary {
  rev: number;
  /** Bumped only by plan writes; plan writes send it as `base_rev`. */
  plan_rev: number;
  cols: number;
  rows: number;
  surface: string[];
  feature: string[];
  labels: Label[];
  locked: boolean;
  furniture: Furniture[];
  layouts: Layout[];
}
