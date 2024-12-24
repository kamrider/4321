import { createRouter, createWebHashHistory } from 'vue-router'
import UploadMistake from '../components/UploadMistake.vue'
import Settings from '../components/Settings.vue'
import Mistake from '../components/Mistake.vue'
import NotFound from '../components/NotFound.vue'
import History from '../components/History.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/upload'
    },
    {
      path: '/upload',
      component: UploadMistake
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
    },
    {
      path: '/pair-mistake',
      name: 'PairMistake',
      component: () => import('../components/PairMistake.vue')
    }
  ]
})

export default router
