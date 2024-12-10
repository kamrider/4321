<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import UploadMistake from './components/UploadMistake.vue'
</script>

<template>
  <div class="app-container">
    <Sidebar />
    <div class="main-content">
      <UploadMistake />
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
