<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { MistakeItem as HistoryItem, TrainingRecord } from '../../electron/preload'

const historyList = ref<HistoryItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const result = await window.ipcRenderer.getMistakes()
    if (result.success) {
      historyList.value = result.data.filter(item => {
        const trainingDate = new Date(item.metadata.nextTrainingDate)
        const now = new Date()
        
        // 重置时间部分，只比较日期
        trainingDate.setHours(0, 0, 0, 0)
        now.setHours(0, 0, 0, 0)
        
        // 只保留训练日期小于等于今天的内容
        return trainingDate.getTime() <= now.getTime()
      })
    } else {
      error.value = result.error || '加载训练内容失败'
    }
  } catch (error) {
    console.error('加载训练内容失败:', error)
    error.value = '加载训练内容失败'
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

// 添加计算天数的函数
const calculateDays = (dateStr: string): number => {
  const uploadDate = new Date(dateStr)
  const now = new Date()
  
  // 重置时间部分，只比较日期
  uploadDate.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  
  const diffTime = Math.abs(now.getTime() - uploadDate.getTime())
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  return days
}

// 格式化"已加入天数"的显示
const formatJoinDays = (dateStr: string): string => {
  const days = calculateDays(dateStr)
  if (days === 0) {
    return '今天加入'
  }
  return `已加入 ${days} 天`
}

// 计算训练状态和显示文本
const formatTrainingStatus = (dateStr: string): { text: string; status: 'pending' | 'today' | 'overdue' } => {
  const trainingDate = new Date(dateStr)
  const now = new Date()
  
  // 重置时间部分，只比较日期
  trainingDate.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  
  const diffTime = trainingDate.getTime() - now.getTime()
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  if (days > 0) {
    return { text: `还有 ${days} 天训练`, status: 'pending' }
  } else if (days === 0) {
    return { text: '今天训练', status: 'today' }
  } else {
    return { text: `逾期 ${Math.abs(days)} 天`, status: 'overdue' }
  }
}
</script>

<template>
  <div class="mistake-container">
    <el-empty v-if="!loading && historyList.length === 0" description="暂无错题" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="preview-area">
          <div v-for="item in historyList" 
               :key="item.fileId" 
               class="preview-item">
            <el-image 
              :src="item.preview" 
              :preview-src-list="[item.preview]"
              fit="contain"
              class="preview-image"
            />
            <div class="file-info">
              <p class="file-name">{{ item.originalFileName }}</p>
              <div class="metadata-info">
                <p class="join-days">
                  {{ formatJoinDays(item.uploadDate) }}
                </p>
                <p class="metadata-item">
                  <span class="label">熟练度:</span> 
                  <el-progress :percentage="item.metadata.proficiency" />
                </p>
                <p class="metadata-item">
                  <span class="label">训练状态:</span> 
                  <span 
                    class="training-status" 
                    :class="formatTrainingStatus(item.metadata.nextTrainingDate).status"
                  >
                    {{ formatTrainingStatus(item.metadata.nextTrainingDate).text }}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<style scoped>
/* 保留原有样式 */
.mistake-container {
  padding: 20px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 添加新样式 */
.metadata-info {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.metadata-item {
  margin: 12px 0;
  font-size: 15px;
  color: #666;
}

.label {
  color: #333;
  font-weight: 600;
  margin-right: 12px;
  font-size: 15px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.tag {
  margin-right: 4px;
}

/* 调整图片容器的最小高度 */
.preview-item {
  min-height: 400px;
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

.join-days {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-color-primary);
  margin-bottom: 16px;
  text-align: center;
  padding: 12px;
  background-color: var(--el-color-primary-light-9);
  border-radius: 8px;
}

.training-status {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 16px;
}

.training-status.pending {
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.training-status.today {
  background-color: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

.training-status.overdue {
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
</style> 