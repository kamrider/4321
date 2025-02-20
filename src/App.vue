<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const handleMenuClick = (route: string) => {
  router.push(route)
}
</script>

<template>
  <div class="app-container">
    <Sidebar @menu-click="handleMenuClick" />
    <div class="main-content">
      <div class="content-wrapper">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['History', 'Mistake', 'ExportedMistakes']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </div>
    </div>
  </div>
</template>

<style>
.app-container {
  display: flex;
  min-height: 100vh;
}

.main-content {
  position: fixed;
  top: 2%;
  right: 2%;
  bottom: 2%;
  left: calc(200px + 2%);
  background-color: #f5f7fa;
  overflow-y: auto;
  padding: 2%;
}

/* 响应式布局 - 当侧边栏折叠时 */
@media (max-width: 768px) {
  .main-content {
    left: calc(64px + 2%);
  }
}

.content-wrapper {
  height: 100%;
  width: 100%;
}
</style>
