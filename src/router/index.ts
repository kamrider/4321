import { createRouter, createWebHashHistory } from 'vue-router'
import UploadMistake from '../components/UploadMistake.vue'
import Settings from '../components/Settings.vue'
import Mistake from '../components/Mistake.vue'
import NotFound from '../components/NotFound.vue'

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
      path: '/:pathMatch(.*)*',
      component: NotFound
    }
  ]
})

export default router
