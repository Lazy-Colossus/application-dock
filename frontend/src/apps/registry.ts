// Static app registry — single source of truth for the shell landing page.
// Adding a new app: append one entry here AND add a lazy-loaded route in
// src/router/routes.ts. No other file changes required (HomePage iterates
// this array; AppCard is generic).

export interface AppDescriptor {
  id: string;
  label: string;
  icon: string; // Material Icons name
  route: string;
}

export const apps: AppDescriptor[] = [
  {
    id: 'archery',
    // Thematic monochrome target reticle (Material Icons) — Story 9.2.
    label: 'Archery Score Counter',
    icon: 'adjust',
    route: '/archery'
  }
];
