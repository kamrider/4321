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
      <div class="content-wrapper">
        <router-view></router-view>
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
  background-color: #e6f0fc; /* 调试用的背景色，之后可以改回 #fff 或需要的颜色 */
  overflow-y: auto;
  padding: 2%;
  border-radius: 8px; /* 可选：添加圆角 */
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05); /* 可选：添加阴影 */
}

.main-content.full-width {
  left: 2%; /* 当不显示侧边栏时占据全宽 */
}

/* 响应式布局 - 当侧边栏折叠时 */
@media (max-width: 768px) {
  .main-content {
    left: calc(64px + 2%);
  }
  
  .main-content.full-width {
    left: 2%;
  }
}

.content-wrapper {
  height: 100%;
  width: 100%;
}
</style>
