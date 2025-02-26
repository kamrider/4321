<template>
  <div class="settings-wrapper">
    <div class="settings-content">
      <el-tabs>
        <el-tab-pane label="存储设置">
          <el-card class="settings-card">
            <template #header>
              <div class="card-header">
                <span>存储设置</span>
              </div>
            </template>
            
            <div class="storage-path">
              <span class="label">当前存储路径：</span>
              <el-input
                v-model="storagePath"
                readonly
                :placeholder="storagePath || '未设置存储路径'"
              >
                <template #append>
                  <el-button @click="handleSetStoragePath">
                    <el-icon><Folder /></el-icon>
                    选择路径
                  </el-button>
                </template>
              </el-input>
            </div>
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="训练配置">
          <TrainingConfigPanel />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Folder } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import TrainingConfigPanel from './TrainingConfigPanel.vue'

const storagePath = ref('')

onMounted(async () => {
  try {
    storagePath.value = await window.ipcRenderer.invoke('file:get-storage-path')
  } catch (error) {
    console.error('获取存储路径失败:', error)
  }
})

const handleSetStoragePath = async () => {
  try {
    const result = await window.ipcRenderer.invoke('file:set-storage-path')
    if (result.success) {
      storagePath.value = result.path
      ElMessage.success('存储路径设置成功')
    }
  } catch (error) {
    console.error('设置存储路径失败:', error)
    ElMessage.error('设置存储路径失败')
  }
}
</script>

<style scoped>
.settings-wrapper {
  display: flex;
  justify-content: center;
  padding: 40px 20px;
  animation: fadeIn 0.5s ease-out;
}

.settings-content {
  width: 100%;
  max-width: 600px;
  transform-origin: top center;
  animation: slideDown 0.4s ease-out;
}

.settings-card {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.settings-card:hover {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 500;
}

.storage-path {
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.3s ease;
  animation: fadeIn 0.6s ease-out;
}

.label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
  transition: color 0.3s ease;
}

:deep(.el-input-group__append) {
  padding: 0;
  overflow: hidden;
}

:deep(.el-input-group__append button) {
  border: none;
  height: 100%;
  padding: 0 20px;
  font-size: 14px;
  min-width: 150px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  overflow: hidden;
  background-color: var(--el-color-primary);
  color: white;
}

:deep(.el-input-group__append button:hover) {
  background-color: var(--el-color-primary-dark-2);
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
}

:deep(.el-input-group__append button:active) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.2);
  background-color: var(--el-color-primary);
}

:deep(.el-input-group__append button::after) {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  background: rgba(255, 255, 255, 0.5);
  opacity: 0;
  border-radius: 100%;
  transform: scale(1, 1) translate(-50%);
  transform-origin: 50% 50%;
}

:deep(.el-input-group__append button:focus:not(:active)::after) {
  animation: ripple 1s ease-out;
}

:deep(.el-icon) {
  margin-right: 8px;
  font-size: 16px;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

:deep(.el-input-group__append button:hover .el-icon) {
  transform: scale(1.2) rotate(5deg);
}

:deep(.el-tabs__content) {
  padding: 20px 0;
}

:deep(.el-tabs__item) {
  transition: all 0.3s ease;
}

:deep(.el-tabs__item:hover) {
  transform: translateY(-2px);
}

:deep(.el-tabs__item.is-active) {
  font-weight: bold;
  transform: translateY(-2px);
}

:deep(.el-tab-pane) {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ripple {
  0% {
    transform: scale(0, 0);
    opacity: 0.5;
  }
  20% {
    transform: scale(25, 25);
    opacity: 0.3;
  }
  100% {
    opacity: 0;
    transform: scale(40, 40);
  }
}
</style> 