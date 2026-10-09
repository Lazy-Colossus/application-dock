// Whether a TeaWrite has what it takes to be saved (FR-2: a name and a
// classification, everything else optional). Shared by NewTeaPage and
// TeaDetailPage so "can I save" means the same thing whether you're creating
// a tea or editing one you already own — clearing the name or reclassifying
// to nothing must disable Save on both, not just one.

import type { TeaWrite } from "./types";

export function canSaveTea(write: TeaWrite): boolean {
  return write.name.trim().length > 0 && write.catalogue_node_id.length > 0;
}
