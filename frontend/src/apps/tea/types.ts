// Mirrors backend/app/schemas/tea.py. snake_case because the API serializes
// directly, with no envelope.

export type TeaClass =
  | "green"
  | "yellow"
  | "white"
  | "oolong"
  | "red"
  | "dark"
  | "other";

// Eight values matching backend/app/schemas/tea.py:TeaForm.
export type TeaForm =
  | "loose"
  | "cake"
  | "brick"
  | "tuo"
  | "ball"
  | "bag"
  | "sample"
  | "other";

export type HarvestSeason = "spring" | "summer" | "autumn" | "winter";

export type NodeSource = "seed" | "user";

export interface CatalogueNode {
  id: string;
  parent_id: string | null;
  name: string;
  name_zh: string;
  source: NodeSource;
  default_origin: string;
}

export interface Tea {
  id: string;
  name: string;
  catalogue_node_id: string;
  // Backend types class_id as string; client narrows to TeaClass union for safety.
  class_id: TeaClass;
  form: TeaForm | null;
  origin: string;
  vendor: string;
  year: number | null;
  harvest_season: HarvestSeason | null;
  cultivar: string;
  grams_purchased: number | null;
  grams_remaining: number;
  price_paid: number | null;
  purchase_date: string | null;
  storage_location: string;
  low_threshold_grams: number | null;
  notes: string;
  image_url: string | null;
  brewing: BrewingParameters | null;
  created_at: string;
  updated_at: string;
}

/** The body for both create and replace — every field except the server's. */
export type TeaWrite = Omit<
  Tea,
  "id" | "class_id" | "created_at" | "updated_at"
>;

export interface AutofillSuggestion {
  catalogue_node_id: string;
  origin: string;
}

export interface BrewingParameters {
  leaf_grams: number | null;
  water_temp_c: number | null;
  steep_seconds: number[];
}

export type AlmanacEntrySource = "seed" | "user";

export interface AlmanacEntryView {
  catalogue_node_id: string;
  country: string;
  reading: string;
  summary: string;
  brewing: BrewingParameters;
  source: AlmanacEntrySource;
  name: string;
  name_zh: string;
  default_origin: string;
}

export type SessionStatus = "in_progress" | "finalised";

export type CurveSource = "best_session" | "tea" | "almanac" | "generic";

export interface Infusion {
  number: number;
  target_seconds: number;
  actual_seconds: number | null;
}

export interface TeaSessionWrite {
  tea_id: string;
  status: SessionStatus;
  started_at: string;
  leaf_grams: number | null;
  water_temp_c: number | null;
  rating: number | null;
  curve_source: CurveSource;
  curve_source_label: string;
  infusions: Infusion[];
  teaware_id: string | null;
}

export interface TeaSession extends TeaSessionWrite {
  id: string;
  brewed_by: string;
  vessel_volume_ml: number | null;
  updated_at: string;
  finished_at: string | null;
}

export interface BrewingCurve {
  leaf_grams: number | null;
  water_temp_c: number | null;
  steep_seconds: number[];
  source: CurveSource;
  source_label: string;
}

/** The caller's cabinet. `members` includes the owner; `id` is null until the first write. */
export interface Cabinet {
  id: string | null;
  owner: string;
  members: string[];
  is_owner: boolean;
}

export type TeawareType = "gaiwan" | "pot" | "kyusu" | "chawan" | "pitcher" | "cup" | "other";
export type TeawareMaterial = "porcelain" | "clay" | "stoneware" | "glass" | "other";

export interface Teaware {
  id: string;
  name: string;
  type: TeawareType;
  material: TeawareMaterial | null;
  volume_ml: number | null;
  porous: boolean;
  dedicated_node_id: string | null;
  maker: string;
  origin: string;
  acquired_date: string | null;
  price_paid: number | null;
  notes: string;
  image_url: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Create/replace body: server fields dropped, `retired` stands in for `retired_at`. */
export interface TeawareWrite {
  name: string;
  type: TeawareType;
  material: TeawareMaterial | null;
  volume_ml: number | null;
  porous: boolean;
  dedicated_node_id: string | null;
  maker: string;
  origin: string;
  acquired_date: string | null;
  price_paid: number | null;
  notes: string;
  retired: boolean;
}

export interface TeawareUsage {
  sessions: TeaSession[];
  total: number;
  off_dedication: number;
}
