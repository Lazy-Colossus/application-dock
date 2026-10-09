export type ResourceId =
  | "microorganisms"
  | "alien_technologies"
  | "minerals"
  | "strange_flora"
  | "living_specimens";

export type TierId = "basic" | "rare" | "very_rare";

export type Grid = Record<ResourceId, Record<TierId, number>>;

export interface Project {
  id: string;
  code: string;
  name: string;
  prerequisite_id: string | null;
  cost: Grid;
  done: boolean;
}

export interface Ship {
  // null while the caller owns an implicit empty ship the server hasn't written yet.
  id: string | null;
  owner: string;
  members: string[];
  is_owner: boolean;
  rev: number;
  stock: Grid;
  projects: Project[];
}

export interface ProjectDraft {
  code: string;
  name: string;
  prerequisite_id: string | null;
  cost: Grid;
}

export interface Shortage {
  resource: ResourceId;
  tier: TierId;
  amount: number;
}

export interface ProjectShortfall {
  project: Project;
  missing: Shortage[];
}
