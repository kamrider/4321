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
      <router-view></router-view>
    </div>
  </div>
</template>

<style>
.app-container {
  display: flex;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.main-content {
  margin-left: 240px;
  flex: 1;
  transition: all 0.3s ease;
  padding: 20px;
}
</style>
