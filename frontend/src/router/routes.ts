import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/pages/LoginPage.vue"),
  },
  {
    path: "/",
    component: () => import("@/layouts/MainLayout.vue"),
    children: [
      {
        path: "",
        name: "home",
        component: () => import("@/pages/HomePage.vue"),
        meta: { title: "Apps", requiresAuth: true },
      },
      {
        path: "settings",
        name: "settings",
        component: () => import("@/pages/SettingsPage.vue"),
        meta: { title: "Settings", requiresAuth: true },
      },
      {
        path: "archery",
        name: "archery-home",
        component: () => import("@/apps/archery/pages/ArcheryHomePage.vue"),
        meta: { title: "Archery", requiresAuth: true },
      },
      {
        path: "archery/setup",
        name: "archery-setup",
        component: () => import("@/apps/archery/pages/SessionSetupPage.vue"),
        meta: { title: "New Session", requiresAuth: true },
      },
      {
        path: "archery/scoring",
        name: "archery-scoring",
        component: () => import("@/apps/archery/pages/ScoringBoardPage.vue"),
        meta: { title: "Scoring", requiresAuth: true },
      },
      {
        path: "archery/results",
        name: "archery-results",
        component: () => import("@/apps/archery/pages/ResultsPage.vue"),
        meta: { title: "Results", requiresAuth: true },
      },
      {
        path: "archery/players",
        name: "archery-players",
        component: () =>
          import("@/apps/archery/pages/RecurringPlayersPage.vue"),
        meta: { title: "Players", requiresAuth: true },
      },
      {
        path: "archery/history",
        name: "archery-history",
        component: () => import("@/apps/archery/pages/HistoryPage.vue"),
        meta: { title: "History", requiresAuth: true },
      },
      {
        path: "archery/history/:label",
        name: "archery-history-detail",
        component: () => import("@/apps/archery/pages/HistoryDetailPage.vue"),
        meta: { title: "Session", requiresAuth: true },
      },
      {
        path: "hotaru",
        name: "hotaru-home",
        component: () => import("@/apps/hotaru/pages/HotaruHomePage.vue"),
        meta: { title: "Hotaru", requiresAuth: true },
      },
      {
        path: "hotaru/settings",
        name: "hotaru-settings",
        component: () => import("@/apps/hotaru/pages/HotaruSettingsPage.vue"),
        meta: { title: "Settings", requiresAuth: true },
      },
      {
        path: "hotaru/identity",
        name: "hotaru-identity",
        component: () => import("@/apps/hotaru/pages/IdentityPage.vue"),
        meta: { title: "Hotaru", requiresAuth: true },
      },
      {
        path: "hotaru/library",
        name: "hotaru-library",
        component: () => import("@/apps/hotaru/pages/LibraryPage.vue"),
        meta: { title: "Library", requiresAuth: true },
      },
      {
        path: "hotaru/practice",
        name: "hotaru-practice",
        component: () => import("@/apps/hotaru/pages/PracticeSetupPage.vue"),
        meta: { title: "Practice", requiresAuth: true },
      },
      {
        path: "hotaru/drill",
        name: "hotaru-drill",
        component: () => import("@/apps/hotaru/pages/DrillPage.vue"),
        meta: { title: "Practice", requiresAuth: true },
      },
      {
        path: "hotaru/study",
        name: "hotaru-study",
        component: () => import("@/apps/hotaru/pages/StudyPage.vue"),
        meta: { title: "Study", requiresAuth: true },
      },
      {
        path: "hotaru/add-word",
        name: "hotaru-add-word",
        component: () => import("@/apps/hotaru/pages/AddWordPage.vue"),
        meta: { title: "Add word", requiresAuth: true },
      },
      {
        path: "hotaru/words/:id/edit",
        name: "hotaru-edit-word",
        component: () => import("@/apps/hotaru/pages/AddWordPage.vue"),
        meta: { title: "Edit word" },
      },
      {
        path: "context-switch",
        name: "context-switch-home",
        component: () =>
          import("@/apps/context-switch/pages/ContextSwitchHomePage.vue"),
        meta: { title: "Context-Switch", requiresAuth: true },
      },
      {
        path: "context-switch/lists/:listId",
        name: "context-switch-board",
        component: () => import("@/apps/context-switch/pages/BoardPage.vue"),
        meta: { title: "Context-Switch", requiresAuth: true },
      },
      {
        path: "listies",
        name: "listies-home",
        component: () => import("@/apps/listies/pages/ListiesHomePage.vue"),
        meta: { title: "Listies", requiresAuth: true },
      },
      {
        path: "listies/sheets/:sheetId",
        name: "listies-sheet",
        component: () => import("@/apps/listies/pages/SheetPage.vue"),
        meta: { title: "Listies", requiresAuth: true },
      },
      {
        path: "kalendariq",
        name: "kalendariq-home",
        component: () =>
          import("@/apps/kalendariq/pages/KalendariqHomePage.vue"),
        meta: { title: "Kalendariq", requiresAuth: true },
      },
      {
        path: "kalendariq/c/:calendarId",
        name: "kalendariq-calendar",
        component: () => import("@/apps/kalendariq/pages/CalendarPage.vue"),
        meta: { title: "Kalendariq", requiresAuth: true },
      },
      {
        path: "question-of-the-day",
        name: "qotd-home",
        component: () =>
          import("@/apps/question-of-the-day/pages/QotdHomePage.vue"),
        meta: { title: "Question of the Day", requiresAuth: true },
      },
      {
        path: "question-of-the-day/history",
        name: "qotd-history",
        component: () =>
          import("@/apps/question-of-the-day/pages/HistoryPage.vue"),
        meta: { title: "Past questions", requiresAuth: true },
      },
      {
        path: "question-of-the-day/days/:date",
        name: "qotd-day",
        component: () => import("@/apps/question-of-the-day/pages/DayPage.vue"),
        meta: { title: "Past question", requiresAuth: true },
      },
      {
        // The invitee link. Deliberately NOT `requiresAuth`: an invitee arrives
        // from a group chat with no account, and bouncing them to a login they
        // cannot pass would be the whole feature failing. The token in the path
        // is the authorisation, and the server enforces what it buys.
        path: "kalendariq/s/:shareToken",
        name: "kalendariq-shared-calendar",
        component: () => import("@/apps/kalendariq/pages/CalendarPage.vue"),
        meta: { title: "Kalendariq", hideShellNav: true },
      },
      {
        // Kalendariq was called KDH until 2026-09-06. Invitee links live in
        // group chats forever and nobody can reissue them, so the old paths
        // stay as redirects rather than 404s. Params carry across by name.
        path: "kdh/s/:shareToken",
        redirect: (to) => ({
          name: "kalendariq-shared-calendar",
          params: to.params,
        }),
      },
      {
        path: "kdh/c/:calendarId",
        redirect: (to) => ({ name: "kalendariq-calendar", params: to.params }),
      },
      {
        path: "kdh",
        redirect: { name: "kalendariq-home" },
      },
    ],
  },
  {
    path: "/:catchAll(.*)*",
    name: "not-found",
    component: () => import("@/pages/ErrorNotFound.vue"),
    meta: { requiresAuth: true },
  },
];

export default routes;
