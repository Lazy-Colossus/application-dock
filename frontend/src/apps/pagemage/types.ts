// Mirrors the backend schemas in app/schemas/pagemage.py (snake_case JSON).

export interface Page {
  id: string;
  name: string;
  html: string;
  share_token: string;
  created_at: string;
  updated_at: string;
}

export interface PageSummary {
  id: string;
  name: string;
  shared: boolean;
  created_at: string;
  updated_at: string;
}
