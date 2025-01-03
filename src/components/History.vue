<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Timer } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { MistakeItem as HistoryItem, TrainingRecord } from '../../electron/preload'

const historyList = ref<HistoryItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// 添加预览相关的响应式变量
const dialogVisible = ref(false)
const activeItem = ref<HistoryItem | null>(null)
const showAnswer = ref(false)

// 添加计时器相关的响应式变量
const time = ref(0)
const timerInterval = ref<number | null>(null)

// 格式化时间显示，包含毫秒
const formattedTime = computed(() => {
  const totalMs = time.value * 10 // 因为我们每10ms更新一次
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const ms = Math.floor((totalMs % 1000) / 10)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
})

onMounted(async () => {
  try {
    const result = await window.ipcRenderer.mistake.getTrainingHistory()
    if (result.success) {
      historyList.value = result.data
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

// 修改答题函数，使用正确的 submitResult 方法
const handleRemembered = async (item: HistoryItem, remembered: boolean) => {
  // 停止计时
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }

  // 记录答题时间（毫秒）
  const answerTime = time.value * 10

  try {
    const result = await window.ipcRenderer.training.submitResult(item.fileId, remembered)
    if (result.success) {
      ElMessage.success(remembered ? '太棒了！继续保持！' : '没关系，下次继续加油！')
      // 更新列表
      const nextTraining = await window.ipcRenderer.training.getNextTraining(item.fileId)
      if (nextTraining.success) {
        // 更新列表中对应项的训练信息
        const listItem = historyList.value.find(i => i.fileId === item.fileId)
        if (listItem && listItem.metadata) {
          listItem.metadata.nextTrainingDate = nextTraining.data.nextTrainingDate
          listItem.metadata.proficiency = nextTraining.data.currentProficiency
          listItem.metadata.trainingInterval = nextTraining.data.currentInterval
        }
      }
    }
  } catch (error) {
    console.error('提交答案失败:', error)
    ElMessage.error('提交答案失败')
  }

  dialogVisible.value = false
}

// 修改预览处理函数，添加计时器启动
const handleViewDetail = (item: HistoryItem) => {
  activeItem.value = item
  dialogVisible.value = true
  // 开始计时，每10ms更新一次以显示毫秒
  time.value = 0
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
  timerInterval.value = setInterval(() => {
    time.value++
  }, 10)
}

// 修改关闭预览处理函数，添加计时器清理
const handleCloseDialog = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }
  dialogVisible.value = false
  activeItem.value = null
  showAnswer.value = false
}

// 添加切换答案显示的函数
const toggleAnswer = () => {
  showAnswer.value = !showAnswer.value
}

// 添加导出函数
const exportHistory = async () => {
  try {
    loading.value = true
    const result = await window.ipcRenderer.file.exportTrainingHistory()
    if (result.success) {
      ElMessage.success(`成功导出到: ${result.data.exportDir}`)
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  } finally {
    loading.value = false
  }
}

// 确保在组件卸载时清理计时器
onUnmounted(() => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
})

// 提交训练结果的方法
const submitTraining = async (fileId: string, success: boolean) => {
  // 停止计时
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }

  // 记录答题时间（毫秒）
  const answerTime = time.value * 10

  try {
    const result = await window.ipcRenderer.training.submitResult(fileId, success)
    if (result.success) {
      // 提交成功后重新获取训练状态
      const nextTraining = await window.ipcRenderer.training.getNextTraining(fileId)
      if (nextTraining.success) {
        // 更新列表中对应项的训练信息
        const item = historyList.value.find(item => item.fileId === fileId)
        if (item) {
          // 初始化确保
          if (!item.metadata) {
            item.metadata = {
              proficiency: 0,
              trainingInterval: 0,
              lastTrainingDate: '',
              nextTrainingDate: '',
              subject: '',
              tags: [],
              notes: '',
              trainingRecords: []
            }
          }
          if (!item.metadata.trainingRecords) {
            item.metadata.trainingRecords = []
          }
          
          // 更新训练信息
          item.metadata.nextTrainingDate = nextTraining.data.nextTrainingDate
          item.metadata.proficiency = nextTraining.data.currentProficiency
          item.metadata.trainingInterval = nextTraining.data.currentInterval
          
          // 添加新记录，包含答题时间
          item.metadata.trainingRecords.push({
            date: new Date().toISOString(),
            result: success ? 'success' : 'fail',
            proficiencyBefore: item.metadata.proficiency,
            proficiencyAfter: nextTraining.data.currentProficiency,
            intervalAfter: nextTraining.data.currentInterval,
            isOnTime: true,
            answerTime // 添加答题时间
          })
        }
      }
      ElMessage.success('训练记录已保存')
      // 移除关闭对话框的代码
      // dialogVisible.value = false
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('提交训练结果失败:', error)
    ElMessage.error('提交训练结果失败')
  }
}
</script>

<template>
  <div class="mistake-container">
    <div class="header-actions">
      <el-button type="primary" @click="exportHistory" :loading="loading">
        导出训练历史
      </el-button>
    </div>
    
    <el-empty v-if="!loading && historyList.length === 0" description="暂无错题" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="preview-area">
          <div v-for="item in historyList" 
               :key="item.fileId" 
               class="preview-item"
               :class="{
                 'is-mistake': item.metadata?.type === 'mistake' && !item.metadata?.isPaired,
                 'is-answer': item.metadata?.type === 'answer' && !item.metadata?.isPaired,
                 'is-paired': item.metadata?.isPaired
               }">
            <el-image 
              :src="item.preview" 
              :preview-src-list="[]"
              fit="contain"
              class="preview-image"
              @click.stop="handleViewDetail(item)"
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
              <div class="training-actions">
                <el-button 
                  type="success" 
                  size="small"
                  :disabled="formatTrainingStatus(item.metadata.nextTrainingDate).status === 'pending'"
                  @click="handleRemembered(item, true)"
                >
                  记住了
                </el-button>
                <el-button 
                  type="danger" 
                  size="small"
                  :disabled="formatTrainingStatus(item.metadata.nextTrainingDate).status === 'pending'"
                  @click="handleRemembered(item, false)"
                >
                  没记住
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </el-skeleton>
  </div>
  
  <!-- 添加详情弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    :title="activeItem?.metadata?.type === 'mistake' ? '错题详情' : '答案详情'"
    width="80%"
    :before-close="handleCloseDialog"
    class="mistake-detail-dialog"
  >
    <!-- 秒表显示 -->
    <div class="timer-container">
      <div class="timer-display">
        <el-icon class="timer-icon"><Timer /></el-icon>
        <span class="timer-text">{{ formattedTime }}</span>
      </div>
    </div>

    <!-- 左侧"记住了"按钮 -->
    <div class="side-button left-button">
      <el-button 
        type="success" 
        size="large"
        round
        :disabled="activeItem && formatTrainingStatus(activeItem.metadata.nextTrainingDate).status === 'pending'"
        @click="activeItem && submitTraining(activeItem.fileId, true)"
      >
        记住了
      </el-button>
    </div>

    <!-- 右侧"没记住"按钮 -->
    <div class="side-button right-button">
      <el-button 
        type="danger" 
        size="large"
        round
        :disabled="activeItem && formatTrainingStatus(activeItem.metadata.nextTrainingDate).status === 'pending'"
        @click="activeItem && submitTraining(activeItem.fileId, false)"
      >
        没记住
      </el-button>
    </div>

    <div class="detail-container" v-if="activeItem">
      <div class="mistake-section">
        <el-image 
          :src="activeItem.preview"
          :preview-src-list="[activeItem.preview]"
          fit="contain"
          class="detail-image"
        />
      </div>
      
      <div class="answer-control" v-if="activeItem.metadata?.isPaired">
        <el-button 
          type="primary" 
          @click="toggleAnswer"
          :icon="showAnswer ? 'Hide' : 'View'"
        >
          {{ showAnswer ? '隐藏答案' : '查看答案' }}
        </el-button>
      </div>
      
      <div class="answer-section" v-if="showAnswer && activeItem.metadata?.pairedWith">
        <!-- 如果 pairedWith 是数组，遍历显示所有答案 -->
        <template v-if="Array.isArray(activeItem.metadata.pairedWith)">
          <div v-for="(answer, index) in activeItem.metadata.pairedWith" 
               :key="answer.fileId"
               class="answer-item"
          >
            <el-image 
              :src="answer.preview"
              :preview-src-list="[answer.preview]"
              fit="contain"
              class="detail-image"
            />
          </div>
        </template>
        
        <!-- 如果 pairedWith 是单个对象，保持原有显示方式 -->
        <template v-else>
          <el-image 
            :src="activeItem.metadata.pairedWith.preview"
            :preview-src-list="[activeItem.metadata.pairedWith.preview]"
            fit="contain"
            class="detail-image"
          />
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
/* 保留原有样式 */
.mistake-container {
  padding: 20px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.header-actions {
  margin-bottom: 20px;
  display: flex;
  justify-content: flex-end;
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

.training-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 添加颜色样式 */
.preview-item.is-mistake {
  border-color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-7);
}

.preview-item.is-answer {
  border-color: var(--el-color-success);
  background-color: var(--el-color-success-light-7);
}

.preview-item.is-paired {
  border-color: #E6A23C;
  background-color: #fdf6ec;
}

/* 添加详情弹窗相关样式 */
.mistake-detail-dialog :deep(.el-dialog__body) {
  padding: 0;
  height: calc(95vh - 100px);
  overflow: hidden;
}

.detail-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.mistake-section,
.answer-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.detail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: #f5f7fa;
}

.answer-control {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 16px;
  display: flex;
  justify-content: center;
  z-index: 2001; /* 确保在弹窗之上 */
}

.answer-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.answer-item {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.answer-item .detail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: #f5f7fa;
}

.mistake-detail-dialog :deep(.el-dialog) {
  position: relative;
}

.timer-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  padding: 10px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  z-index: 2001;
}

.timer-display {
  display: flex;
  align-items: center;
  font-size: 28px;
  color: #409EFF;
}

.timer-icon {
  margin-right: 10px;
  font-size: 28px;
}

.timer-text {
  font-family: monospace;
  font-weight: bold;
}

.side-button {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2001;
}

.left-button {
  left: 40px;
}

.right-button {
  right: 40px;
}

/* 让按钮更明显 */
.side-button :deep(.el-button) {
  padding: 20px 30px;
  font-size: 18px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.side-button :deep(.el-button:hover) {
  transform: scale(1.05);
  transition: transform 0.2s;
}

/* 调整对话框内容，防止被按钮遮挡 */
.detail-container {
  margin: 60px 100px 0; /* 上方留出空间给计时器 */
}
</style> 