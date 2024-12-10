<script setup lang="ts">
import { ref, onMounted } from 'vue'

const storagePath = ref<string>('')
const message = ref<string | null>(null)
const isError = ref(false)

onMounted(async () => {
  try {
    const path = await window.ipcRenderer.uploadFile.getStoragePath()
    storagePath.value = path || '（未设置存储路径）'
  } catch (error) {
    console.error('Error getting storage path:', error)
    showMessage('获取存储路径失败', true)
  }
})

const handleChangeStoragePath = async () => {
  try {
    const newPath = await window.ipcRenderer.uploadFile.setStoragePath()
    if (newPath) {
      storagePath.value = newPath
      showMessage('存储路径修改成功！')
    }
  } catch (error) {
    console.error('Error changing storage path:', error)
    showMessage('修改存储路径失败，请重试！', true)
  }
}

const resetStoragePath = async () => {
  try {
    const defaultPath = await window.ipcRenderer.uploadFile.resetStoragePath()
    storagePath.value = defaultPath
    showMessage('已重置到默认存储路径！')
  } catch (error) {
    console.error('Error resetting storage path:', error)
    showMessage('重置失败，请重试！', true)
  }
}

const showMessage = (msg: string, error = false) => {
  message.value = msg
  isError.value = error
  setTimeout(() => {
    message.value = null
  }, 3000)
}
</script>

<template>
  <div class="settings-container">
    <h2>系统设置</h2>
    
    <div class="message" v-if="message" :class="{ error: isError }">
      {{ message }}
    </div>

    <div class="setting-item">
      <h3>文件存储位置</h3>
      <div class="storage-path">
        <div class="path-display">
          <span class="label">当前路径：</span>
          <span class="path">{{ storagePath }}</span>
        </div>
        <div class="buttons">
          <button @click="handleChangeStoragePath" class="primary-btn">修改路径</button>
          <button @click="resetStoragePath" class="reset-btn">重置默认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.message {
  padding: 10px 16px;
  border-radius: 4px;
  margin-bottom: 20px;
  background: #4caf50;
  color: white;
  animation: fade-in 0.3s ease-out;
}

.message.error {
  background: #ff4444;
}

.setting-item {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.setting-item h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #2c3e50;
}

.storage-path {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.path-display {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  word-break: break-all;
}

.path-display .label {
  color: #666;
  margin-right: 8px;
}

.buttons {
  display: flex;
  gap: 12px;
}

button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
}

.primary-btn {
  background: #2c3e50;
  color: white;
}

.primary-btn:hover {
  background: #34495e;
}

.reset-btn {
  background: #95a5a6;
  color: white;
}

.reset-btn:hover {
  background: #7f8c8d;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style> 