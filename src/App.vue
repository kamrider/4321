<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const showSidebar = computed(() => !['login'].includes(route.name as string))
</script>

<template>
  <div class="app-container">
    <Sidebar v-if="showSidebar" />
    <div :class="['main-content', { 'full-width': !showSidebar }]">
      <router-view></router-view>
    </div>
  </div>
</template>

<style>
.app-container {
  display: flex;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  margin-left: 200px; /* 侧边栏宽度 */
  transition: margin-left 0.3s;
}

.main-content.full-width {
  margin-left: 0;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .main-content {
    margin-left: 64px;
  }
  
  .main-content.full-width {
    margin-left: 0;
  }
}
</style>
