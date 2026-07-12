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
        meta: { title: "Edit word", requiresAuth: true },
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
