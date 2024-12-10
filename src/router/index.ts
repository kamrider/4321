import { createRouter, createWebHashHistory } from 'vue-router'
import UploadMistake from '../components/UploadMistake.vue'
import Settings from '../components/Settings.vue'

const routes = [
  {
    path: '/',
    redirect: '/upload'
  },
  {
    path: '/upload',
    name: 'UploadMistake',
    component: UploadMistake
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../components/NotFound.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
