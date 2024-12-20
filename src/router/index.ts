import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../components/Login.vue'
import UploadMistake from '../components/UploadMistake.vue'
import Settings from '../components/Settings.vue'
import Mistake from '../components/Mistake.vue'
import NotFound from '../components/NotFound.vue'
import History from '../components/History.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: { requiresAuth: false }
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
      path: '/:pathMatch(.*)*',
      component: NotFound
    }
  ]
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  if (to.meta.requiresAuth) {
    const currentUser = await window.electron.invoke('user:get-current')
    if (!currentUser) {
      next('/login')
      return
    }
  }
  next()
})

export default router
