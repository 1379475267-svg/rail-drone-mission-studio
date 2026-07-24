import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

const history = import.meta.env.MODE === 'pages'
  ? createWebHashHistory(import.meta.env.BASE_URL)
  : createWebHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history,
  routes: [
    {
      path: '/',
      name: 'workspace-launcher',
      component: () => import('@/views/WorkspaceLauncherView.vue'),
      meta: { title: '选择工作区' },
    },
    {
      path: '/mission',
      name: 'mission-editor',
      component: () => import('@/views/MissionEditorView.vue'),
      meta: { title: '任务编排' },
    },
    {
      path: '/recognition',
      name: 'contact-line-recognition',
      component: () => import('@/views/RecognitionWorkspaceView.vue'),
      meta: { title: '接触线识别' },
    },
    {
      path: '/coordination',
      name: 'robot-drone-coordination',
      component: () => import('@/views/CoordinationDemoView.vue'),
      meta: { title: '协同闭环' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
