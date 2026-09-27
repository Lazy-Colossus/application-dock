// Static app registry — single source of truth for the shell landing page.
// Adding a new app: append one entry here AND add a lazy-loaded route in
// src/router/routes.ts. No other file changes required (HomePage iterates
// this array; AppCard is generic).

export interface AppDescriptor {
  id: string;
  label: string;
  icon: string; // Material Icons name, or an `app:` drawing from boot/icons.ts
  route: string;
}

export const apps: AppDescriptor[] = [
  {
    id: "archery",
    // Thematic monochrome target reticle (Material Icons) — Story 9.2.
    label: "Archery Score Counter",
    icon: "adjust",
    route: "/archery",
  },
  {
    id: "hotaru",
    label: "Hotaru",
    icon: "school",
    route: "/hotaru",
  },
  {
    id: "context-switch",
    label: "Context-Switch",
    icon: "swap_horiz",
    route: "/context-switch",
  },
  {
    id: "tea",
    // The tea sprig from the app's own home screen. The card is the app; its
    // first screen lists the tea sections — new sections join that home
    // rather than adding cards of their own.
    label: "Tea",
    icon: "app:tea-leaf",
    route: "/tea",
  },
  {
    id: "listies",
    label: "Listies",
    icon: "table_chart",
    route: "/listies",
  },
  {
    id: "kalendariq",
    label: "Kalendariq",
    icon: "event_available",
    route: "/kalendariq",
  },
  {
    id: "kitchencraft",
    label: "KitchenCraft",
    // A notebook, which is what the app is: a household recipe ledger.
    icon: "menu_book",
    route: "/kitchencraft",
  },
  {
    id: "question-of-the-day",
    label: "Question of the Day",
    // A question-prompt glyph, distinct from the other apps' icons.
    icon: "help_center",
    route: "/question-of-the-day",
  },
  {
    id: "shared-notes",
    label: "Shared Notes",
    // A scratchpad glyph — the app is a shared note pad, not a task list.
    icon: "sticky_note_2",
    route: "/shared-notes",
  },
];
