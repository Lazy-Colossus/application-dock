import { ref } from "vue";

// The focus model for the grid, kept as pure state so wrapping, clamping and
// the edit transitions are testable without mounting a grid. It knows nothing
// about the DOM, the store, or what a cell contains — only the shape.

export interface GridPosition {
  rowIndex: number;
  columnIndex: number;
}

export function useGridNavigation(
  rowCount: () => number,
  columnCount: () => number,
) {
  const focused = ref<GridPosition | null>(null);
  const editing = ref(false);

  function within(rowIndex: number, columnIndex: number): boolean {
    return (
      rowIndex >= 0 &&
      rowIndex < rowCount() &&
      columnIndex >= 0 &&
      columnIndex < columnCount()
    );
  }

  function focusCell(rowIndex: number, columnIndex: number): void {
    if (!within(rowIndex, columnIndex)) return;
    focused.value = { rowIndex, columnIndex };
    editing.value = false;
  }

  /** Moving always leaves edit mode — the caller commits first. */
  function moveTo(rowIndex: number, columnIndex: number): void {
    if (!within(rowIndex, columnIndex)) return;
    focused.value = { rowIndex, columnIndex };
    editing.value = false;
  }

  function moveRight(): void {
    const at = focused.value;
    if (at) moveTo(at.rowIndex, at.columnIndex + 1);
  }

  function moveLeft(): void {
    const at = focused.value;
    if (at) moveTo(at.rowIndex, at.columnIndex - 1);
  }

  function moveDown(): void {
    const at = focused.value;
    if (at) moveTo(at.rowIndex + 1, at.columnIndex);
  }

  function moveUp(): void {
    const at = focused.value;
    if (at) moveTo(at.rowIndex - 1, at.columnIndex);
  }

  /** Tab: right, wrapping onto the next row; a no-op at the last cell. */
  function moveNext(): void {
    const at = focused.value;
    if (!at) return;
    if (at.columnIndex + 1 < columnCount()) {
      moveTo(at.rowIndex, at.columnIndex + 1);
    } else {
      moveTo(at.rowIndex + 1, 0);
    }
  }

  /** Shift-Tab: left, wrapping onto the previous row; a no-op at the first cell. */
  function movePrevious(): void {
    const at = focused.value;
    if (!at) return;
    if (at.columnIndex > 0) {
      moveTo(at.rowIndex, at.columnIndex - 1);
    } else {
      moveTo(at.rowIndex - 1, columnCount() - 1);
    }
  }

  function beginEdit(): void {
    if (!focused.value) return;
    editing.value = true;
  }

  function endEdit(): void {
    editing.value = false;
  }

  function isFocused(rowIndex: number, columnIndex: number): boolean {
    const at = focused.value;
    return (
      at !== null && at.rowIndex === rowIndex && at.columnIndex === columnIndex
    );
  }

  function isEditing(rowIndex: number, columnIndex: number): boolean {
    return editing.value && isFocused(rowIndex, columnIndex);
  }

  /** Pull focus back inside after rows or columns disappear. */
  function clampToGrid(): void {
    const at = focused.value;
    if (!at) return;
    const rows = rowCount();
    const columns = columnCount();
    if (rows === 0 || columns === 0) {
      focused.value = null;
      editing.value = false;
      return;
    }
    focused.value = {
      rowIndex: Math.min(at.rowIndex, rows - 1),
      columnIndex: Math.min(at.columnIndex, columns - 1),
    };
  }

  return {
    focused,
    editing,
    focusCell,
    moveRight,
    moveLeft,
    moveDown,
    moveUp,
    moveNext,
    movePrevious,
    beginEdit,
    endEdit,
    isFocused,
    isEditing,
    clampToGrid,
  };
}
