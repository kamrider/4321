import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../components/Login.vue'
import UploadMistake from '../components/UploadMistake.vue'
import Settings from '../components/Settings.vue'
import Mistake from '../components/Mistake.vue'
import NotFound from '../components/NotFound.vue'
import History from '../components/History.vue'
import Members from '../components/Members.vue'
import ExportedMistakes from '../components/ExportedMistakes.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/members'
    },
    {
      path: '/upload',
      name: 'Upload',
      component: UploadMistake,
      meta: { requiresAuth: true }
    },
    {
      path: '/mistake',
      component: Mistake
    },
    {
      path: '/settings',
      component: Settings
    },
    {
      path: '/history',
      component: History
    },
    {
      path: '/members',
      component: Members
    },
    {
      path: '/exported-mistakes',
      component: ExportedMistakes
    },
    {
      path: '/:pathMatch(.*)*',
      component: NotFound
    },
    {
      path: '/pair-mistake',
      name: 'PairMistake',
      component: () => import('../components/PairMistake.vue')
    }
  ]
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  if (to.path === '/login') {
    next()
    return
  }

  const currentUser = await window.electron.invoke('user:get-current')
  
  if (!currentUser && to.meta.requiresAuth) {
    next('/login')
  } else {
    next()
  }
})

export default router
