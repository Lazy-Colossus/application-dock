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
  | "purple"
  | "tan"
  | "pink"
  | "navy"
  | "teal"
  | "olive"
  | "charcoal";

/** Whole degrees clockwise, 0–359. */
export type Rotation = number;

export type Mode = "draw" | "furniture" | "arrange";

export type SaveState = "saving" | "unsaved" | "saved";

/**
 * A door's saved setup, keyed by its anchor: its first square in reading order.
 * `into` 0 opens towards the side above (a door in a horizontal wall) or to the left (in a
 * vertical wall), 1 below or right. `hinge` 0 is the left or top end, 1 the right or bottom.
 */
export interface DoorSetting {
  col: number;
  row: number;
  into: 0 | 1;
  hinge: 0 | 1;
  double: boolean;
}

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
  doors: DoorSetting[];
  furniture: Furniture[];
  layouts: Layout[];
}
