<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface MistakeItem {
  fileId: string
  path: string
  preview: string
  uploadDate: string
  originalDate: string
}

const mistakeList = ref<MistakeItem[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    // 获取存储路径和元数据
    const metadata = await window.ipcRenderer.uploadFile.getMetadata()
    
    // 转换元数据为展示格式
    mistakeList.value = metadata.files.map(file => ({
      fileId: file.fileId,
      path: file.path,
      preview: file.previewUrl,
      uploadDate: file.uploadDate,
      originalDate: file.originalDate
    }))
  } catch (error) {
    console.error('加载错题失败:', error)
  } finally {
    loading.value = false
  }
})

// 复用 UploadMistake 中的日期格式化函数
const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (e) {
    return dateStr
  }
}
</script>

<template>
  <div class="mistake-container">
    <el-empty v-if="!loading && mistakeList.length === 0" description="暂无错题" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="preview-area">
          <div v-for="item in mistakeList" 
               :key="item.fileId" 
               class="preview-item">
            <el-image 
              :src="item.preview" 
              :preview-src-list="[item.preview]"
              fit="contain"
              class="preview-image"
            />
            <div class="file-info">
              <p class="file-name">{{ item.path.split('/').pop() }}</p>
              <p class="file-date">
                上传日期: {{ formatDate(item.uploadDate) }}
              </p>
              <p class="file-date">
                创建日期: {{ formatDate(item.originalDate) }}
              </p>
            </div>
          </div>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<style scoped>
/* 复用 UploadMistake 中的样式 */
.mistake-container {
  padding: 20px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 复用 preview-area 样式 */
.preview-area {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 20px;
}

/* 复用 preview-item 样式 */
.preview-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
  padding: 12px;
  box-shadow: var(--el-box-shadow-lighter);
  transition: all 0.3s;
  width: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.preview-image {
  width: 100%;
  height: auto;
  min-height: 250px;
  max-height: 400px;
  object-fit: contain;
  border-radius: 4px;
  margin-bottom: 8px;
}

.file-info {
  margin-top: 8px;
}

.file-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-date {
  font-size: 12px;
  color: #666;
  margin: 4px 0;
}
</style> 