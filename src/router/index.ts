import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

const history = import.meta.env.MODE === 'pages'
  ? createWebHashHistory(import.meta.env.BASE_URL)
  : createWebHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history,
  routes: [
    {
      path: '/',
      name: 'mission-editor',
      component: () => import('@/views/MissionEditorView.vue'),
    },
    {
      path: '/recognition',
      name: 'contact-line-recognition',
      component: () => import('@/views/RecognitionWorkspaceView.vue'),
    },
    {
      path: '/coordination',
      name: 'robot-drone-coordination',
      component: () => import('@/views/CoordinationDemoView.vue'),
    },
  ],
})

export default router
