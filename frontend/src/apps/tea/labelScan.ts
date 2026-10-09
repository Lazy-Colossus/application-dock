import type { LabelScanSuggestion, TeaWrite } from "./types";

/**
 * The fields a label scan may fill: only ones still empty, so a scan never
 * overwrites typing (and a second scan never overwrites the first's result
 * once the person has corrected it). `filled` names them for the message.
 */
export function labelScanPatch(
  draft: TeaWrite,
  suggestion: LabelScanSuggestion,
  originTouched: boolean,
): { change: Partial<TeaWrite>; filled: string[] } {
  const change: Partial<TeaWrite> = {};
  const filled: string[] = [];

  if (suggestion.name && !draft.name.trim()) {
    change.name = suggestion.name;
    filled.push("name");
  }
  if (suggestion.catalogue_node_id && !draft.catalogue_node_id) {
    change.catalogue_node_id = suggestion.catalogue_node_id;
    filled.push("category");
  }
  if (suggestion.origin && !originTouched && !draft.origin) {
    change.origin = suggestion.origin;
    filled.push("origin");
  }
  if (suggestion.vendor && !draft.vendor) {
    change.vendor = suggestion.vendor;
    filled.push("vendor");
  }
  if (suggestion.year !== null && draft.year === null) {
    change.year = suggestion.year;
    filled.push("year");
  }
  if (suggestion.cultivar && !draft.cultivar) {
    change.cultivar = suggestion.cultivar;
    filled.push("cultivar");
  }
  if (suggestion.grams !== null && draft.grams_purchased === null) {
    change.grams_purchased = suggestion.grams;
    if (draft.grams_remaining === 0) change.grams_remaining = suggestion.grams;
    filled.push("grams");
  }
  return { change, filled };
}
