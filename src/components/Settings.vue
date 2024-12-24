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
    storagePath.value = await window.ipcRenderer.uploadFile.getStoragePath()
  } catch (error) {
    console.error('获取存储路径失败:', error)
  }
})

const handleSetStoragePath = async () => {
  try {
    const result = await window.ipcRenderer.uploadFile.setStoragePath()
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
}

.settings-content {
  width: 100%;
  max-width: 600px;
}

.settings-card {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
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
}

.label {
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-bottom: 8px;
}

:deep(.el-input-group__append) {
  padding: 0;
}

:deep(.el-input-group__append button) {
  border: none;
  height: 100%;
  padding: 0 20px;
  font-size: 14px;
  min-width: 120px;
}

:deep(.el-icon) {
  margin-right: 8px;
  font-size: 16px;
}

:deep(.el-tabs__content) {
  padding: 20px 0;
}
</style> 