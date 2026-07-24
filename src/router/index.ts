import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
