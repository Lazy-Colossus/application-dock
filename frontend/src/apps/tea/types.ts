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
