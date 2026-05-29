import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/pages/HomePage.vue'),
        meta: { title: 'Apps' }
      },
      {
        path: 'archery',
        name: 'archery-home',
        component: () => import('@/apps/archery/pages/ArcheryHomePage.vue'),
        meta: { title: 'Archery' }
      },
      {
        path: 'archery/setup',
        name: 'archery-setup',
        component: () => import('@/apps/archery/pages/SessionSetupPage.vue'),
        meta: { title: 'New Session' }
      },
      {
        path: 'archery/scoring',
        name: 'archery-scoring',
        component: () => import('@/apps/archery/pages/ScoringBoardPage.vue'),
        meta: { title: 'Scoring' }
      },
      {
        path: 'archery/results',
        name: 'archery-results',
        component: () => import('@/apps/archery/pages/ResultsPage.vue'),
        meta: { title: 'Results' }
      },
      {
        path: 'archery/history',
        name: 'archery-history',
        component: () => import('@/apps/archery/pages/HistoryPage.vue'),
        meta: { title: 'History' }
      },
      {
        path: 'archery/history/:label',
        name: 'archery-history-detail',
        component: () => import('@/apps/archery/pages/HistoryDetailPage.vue'),
        meta: { title: 'Session' }
      }
    ]
  },
  {
    path: '/:catchAll(.*)*',
    name: 'not-found',
    component: () => import('@/pages/ErrorNotFound.vue')
  }
];

export default routes;
