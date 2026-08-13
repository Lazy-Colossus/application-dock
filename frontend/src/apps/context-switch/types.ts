// Canonical Context-Switch domain types, mirroring the backend schemas
// (backend/app/schemas/context_switch.py) and the data model in
// docs/planning-artifacts/epics-context-switch.md.

export type TodoStatus = "active" | "archived";

export interface TodoUpdate {
  id: string;
  text: string;
  created_at: string;
}

export interface Todo {
  id: string;
  header: string;
  body: string;
  color: string; // #rrggbb
  status: TodoStatus;
  order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  updates: TodoUpdate[];
}

export interface Grid {
  columns: number;
  rows: number;
}

export interface TodoList {
  id: string;
  name: string;
  grid: Grid;
  created_at: string;
  todos: Todo[];
}

// Body of POST /lists/{id}/todos (Story 2.1).
export interface NewTodo {
  header: string;
  body: string;
  color: string;
}

// Body of PUT /lists/{id}/todos/{todo_id} (Story 2.4) — only provided fields
// are applied. `status` joins it in Story 2.6.
export interface TodoPatch {
  header?: string;
  body?: string;
  color?: string;
}

// Lightweight summary returned by the list-picker endpoint (Story 1.3).
export interface ListSummary {
  id: string;
  name: string;
  active_count: number;
}
