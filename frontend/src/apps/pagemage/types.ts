// Mirrors the backend schemas in app/schemas/pagemage.py (snake_case JSON).

export interface Page {
  id: string;
  name: string;
  html: string;
  created_at: string;
  updated_at: string;
}

export interface PageSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}
