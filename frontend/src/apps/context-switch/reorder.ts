// Drag-reorder math (Story 2.3). Order is one sequence over ALL active todos,
// so the caller passes the full id list and gets a full id list back — the same
// shape the reorder endpoint takes, which keeps order coherent across pages.

/**
 * Move `movedId` to where `targetId` currently sits.
 * Returns the original array when the move is a no-op or either id is unknown.
 */
export function moveId(
  ids: string[],
  movedId: string,
  targetId: string,
): string[] {
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return ids;

  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, movedId);
  return next;
}
