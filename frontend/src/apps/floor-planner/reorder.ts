import { ref } from "vue";

/** `ids` with `moved` taken out and put back just before `target`, or just after it. */
export function moveId(
  ids: string[],
  moved: string,
  target: string,
  after: boolean,
): string[] {
  if (moved === target) return ids;
  const rest = ids.filter((id) => id !== moved);
  const at = rest.indexOf(target) + (after ? 1 : 0);
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/**
 * Drag-to-reorder for a list of rows. Only drags that started in this list count, so a tray
 * card dragged towards the plan never shows a drop line here.
 */
export function useReorderDrag(
  onMove: (moved: string, target: string, after: boolean) => void,
) {
  const dragging = ref<string | null>(null);
  const over = ref<{ id: string; after: boolean } | null>(null);

  function start(e: DragEvent, id: string): void {
    dragging.value = id;
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function hover(e: DragEvent, id: string): void {
    if (!dragging.value) return;
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    over.value = { id, after: e.clientY > box.top + box.height / 2 };
  }

  function drop(e: DragEvent): void {
    e.preventDefault();
    if (dragging.value && over.value) {
      onMove(dragging.value, over.value.id, over.value.after);
    }
    end();
  }

  function end(): void {
    dragging.value = null;
    over.value = null;
  }

  /** The drop line's side, for the row the pointer is over. */
  function lineOn(id: string): "before" | "after" | null {
    if (over.value?.id !== id || dragging.value === id) return null;
    return over.value.after ? "after" : "before";
  }

  return { dragging, start, hover, drop, end, lineOn };
}
