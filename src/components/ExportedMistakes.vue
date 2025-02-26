<script setup lang="ts">
import { defineComponent } from 'vue'

defineComponent({
  name: 'ExportedMistakes'
})

import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Delete, Check, Close, Printer, ArrowDown } from '@element-plus/icons-vue'

interface ExportedMistake {
  path: string
  preview: string
  originalFileId?: string
  exportType: 'selected' | 'training'
  metadata?: any
  answers: Array<{
    path: string
    preview: string
    originalFileId?: string
    metadata?: any
  }>
}

interface ExportedItem {
  date: string
  path: string
  mistakes: ExportedMistake[]
}

const exportedList = ref<ExportedItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// 添加预览相关的状态
const dialogVisible = ref(false)
const activeItem = ref<ExportedItem['mistakes'][0] | null>(null)
const showAnswer = ref(false)

// 添加训练相关的状态
const isTraining = ref(false)

// 添加过滤类型的状态
const filterType = ref<'all' | 'selected' | 'training'>('all')

// 添加计算属性来对列表进行排序
const sortedExportedList = computed(() => {
  return exportedList.value.map(item => {
    // 对每天的错题进行排序
    const sortedMistakes = [...item.mistakes].sort((a, b) => {
      // 从文件路径中提取序号
      const getNumber = (path: string) => {
        const match = path.match(/错题(\d+)\./);
        return match ? parseInt(match[1]) : 0;
      };
      return getNumber(a.path) - getNumber(b.path);
    });
    
    return {
      ...item,
      mistakes: sortedMistakes
    };
  }).sort((a, b) => {
    // 日期文件夹按照时间降序排序
    const dateA = new Date(a.date.replace(/-/g, '/')).getTime();
    const dateB = new Date(b.date.replace(/-/g, '/')).getTime();
    return dateB - dateA;
  });
});

// 修改计算属性，添加过滤逻辑
const filteredExportedList = computed(() => {
  return sortedExportedList.value.map(item => {
    const filteredMistakes = item.mistakes.filter(mistake => {
      if (filterType.value === 'all') return true;
      return mistake.exportType === filterType.value;
    });
    
    return {
      ...item,
      mistakes: filteredMistakes
    };
  }).filter(item => item.mistakes.length > 0);
});

// 添加计算属性来判断是否可以训练
const canTrain = computed(() => {
  if (!activeItem.value?.metadata?.nextTrainingDate) {
    return false
  }
  
  const nextTrainingDate = new Date(activeItem.value.metadata.nextTrainingDate)
  const now = new Date()
  return nextTrainingDate <= now
})

// 添加提交状态
const isSubmitting = ref(false)

// 添加计时器相关的响应式变量
const time = ref(0)
const timerInterval = ref<number | null>(null)
const timerStates = ref(new Map<string, number>())

// 添加计时器相关函数
const startTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
  timerInterval.value = setInterval(() => {
    time.value++
  }, 10)
}

const saveCurrentTimerState = () => {
  if (activeItem.value) {
    timerStates.value.set(activeItem.value.originalFileId, time.value)
  }
}

const loadTimerState = (fileId: string) => {
  time.value = timerStates.value.get(fileId) || 0
  startTimer()
}

// 添加计算属性
const formattedTime = computed(() => {
  const totalMs = time.value * 10
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const ms = Math.floor((totalMs % 1000) / 10)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
})

// 添加导出状态
const exportingDates = ref<Record<string, boolean>>({})

onMounted(async () => {
  try {
    const result = await window.ipcRenderer.invoke('file:get-exported-mistakes')
    if (result.success) {
      // 获取每个源文件的metadata
      for (const item of result.data) {
        for (const mistake of item.mistakes) {
          if (mistake.originalFileId) {
            const sourceMetadata = await window.ipcRenderer.invoke('file:get-mistake-details', mistake.originalFileId)
            if (sourceMetadata.success && sourceMetadata.data) {
              mistake.metadata = sourceMetadata.data.metadata
            }
          }
        }
      }

      exportedList.value = result.data
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('加载导出记录失败:', error)
    error.value = '加载失败'
  } finally {
    loading.value = false
  }
})

const handleViewDetail = (item: ExportedMistake) => {
  activeItem.value = item
  dialogVisible.value = true
  showAnswer.value = false
  loadTimerState(item.originalFileId)
  isTraining.value = true
}

const handleCloseDialog = () => {
  if (activeItem.value) {
    saveCurrentTimerState()
  }
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }
  dialogVisible.value = false
  activeItem.value = null
  time.value = 0
  showAnswer.value = false
}

const handleDelete = async (date: string) => {
  try {
    const result = await window.ipcRenderer.file.deleteExportedMistakes(date)
    if (result.success) {
      exportedList.value = exportedList.value.filter(item => item.date !== date)
      ElMessage.success('删除成功')
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('删除失败:', error)
    ElMessage.error('删除失败')
  }
}

const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateStr
  }
}

// 修改训练结果提交函数
const handleTrainingResult = async (remembered: boolean) => {
  if (isSubmitting.value) return
  
  if (!activeItem.value?.originalFileId) {
    ElMessage.warning('无法找到原始错题信息')
    return
  }

  try {
    isSubmitting.value = true
        // 添加视觉反馈
     const loadingMessage = ElMessage({
      message: '正在提交训练结果...',
      type: 'info',
      duration: 0
    })
    // 如果没记住，则导出错题
    if (!remembered) {
      // 获取当前错题的完整信息
      const mistakeResult = await window.ipcRenderer.file.getMistakeDetails(activeItem.value.originalFileId)
      if (!mistakeResult.success) {
        throw new Error('获取错题详情失败')
      }

      // 调用导出函数
      const exportResult = await window.ipcRenderer.file.exportMistake({
        mistake: mistakeResult.data,
        answer: mistakeResult.data.metadata?.pairedWith,
        exportTime: new Date().toISOString(),
        exportType: 'training'
      })
      
      if (exportResult.success) {
        ElMessage.success('已自动导出到错题本')
      }
    }

    // 提交训练结果
    const result = await window.ipcRenderer.training.submitResult(
      activeItem.value.originalFileId,
      remembered
    )

    if (result.success) {
      // 关闭加载提示
      loadingMessage.close()
      
      // 成功提示
      ElMessage.success({
        message: remembered ? '太棒了！继续保持！' : '没关系，下次继续加油！',
        duration: 2000
      })
      
      // 更新本地状态
      if (activeItem.value.metadata) {
        const nextTraining = await window.ipcRenderer.training.getNextTraining(
          activeItem.value.originalFileId
        )
        if (nextTraining.success) {
          activeItem.value.metadata.proficiency = nextTraining.data.currentProficiency
          activeItem.value.metadata.trainingInterval = nextTraining.data.currentInterval
          activeItem.value.metadata.nextTrainingDate = nextTraining.data.nextTrainingDate
        }

        // 解冻该错题
        await window.ipcRenderer.file.setFrozen(activeItem.value.originalFileId, false)
        activeItem.value.metadata.isFrozen = false
        ElMessage.success('该错题已解冻')
      }
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('提交训练结果失败:', error)
    ElMessage.error('提交训练结果失败')
  } finally {
    setTimeout(() => {
      isSubmitting.value = false
    }, 500)
  }
}

const getItemClass = (mistake: ExportedMistake) => {
  return {
    'mistake-item': true,
    'selected-export': mistake.exportType === 'selected',
    'training-export': mistake.exportType === 'training'
  }
}

// 添加导出到Word的方法
const handleExportToWord = async (date: string, type: string = 'alternate') => {
  if (exportingDates.value[date]) return
  
  exportingDates.value[date] = true
  try {
    const result = await window.ipcRenderer.file.exportDateToWord(date, type)
    
    if (result.success) {
      ElMessage.success('导出成功')
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败：' + (error.message || '未知错误'))
  } finally {
    exportingDates.value[date] = false
  }
}
</script>

<template>
  <div class="exported-container">
    <!-- 添加过滤控制栏 -->
    <div class="filter-bar">
      <el-radio-group v-model="filterType" size="large">
        <el-radio-button label="all">全部记录</el-radio-button>
        <el-radio-button label="selected">选择导出</el-radio-button>
        <el-radio-button label="training">训练导出</el-radio-button>
      </el-radio-group>
    </div>

    <el-empty v-if="!loading && filteredExportedList.length === 0" description="暂无导出记录" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="export-list">
          <div v-for="item in filteredExportedList" 
               :key="item.date" 
               class="export-item">
            <div class="export-header">
              <div class="date-info">
                <el-icon><Document /></el-icon>
                <span>{{ formatDate(item.date) }}</span>
                <span class="count">(共 {{ item.mistakes.length }} 题)</span>
              </div>
              <!-- 添加导出按钮组 -->
              <div class="export-actions">
                <el-dropdown @command="(type) => handleExportToWord(item.date, type)">
                  <el-button type="primary" :loading="exportingDates[item.date]">
                    <el-icon><Printer /></el-icon>
                    导出到Word
                    <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="alternate">错题答案交替</el-dropdown-item>
                      <el-dropdown-item command="mistakesOnly">仅导出错题</el-dropdown-item>
                      <el-dropdown-item command="answersOnly">仅导出答案</el-dropdown-item>
                      <el-dropdown-item command="separated">错题答案分开</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
            
            <div class="mistakes-grid">
              <div v-for="mistake in item.mistakes"
                   :key="mistake.path"
                   :class="getItemClass(mistake)"
                   @click="handleViewDetail(mistake)">
                <div v-if="mistake.metadata?.proficiency === 0" class="warning-badge">
                  需加强
                </div>
                <el-image 
                  :src="mistake.preview"
                  fit="contain"
                  class="preview-image"
                >
                  <template #error>
                    <div class="image-error">
                      加载失败
                    </div>
                  </template>
                </el-image>
                
                <div class="answer-count" v-if="mistake.answers.length > 0">
                  {{ mistake.answers.length }} 个答案
                </div>

                <div class="mistake-info" v-if="mistake.metadata">
                  <div class="proficiency" :class="{ 'zero-proficiency': mistake.metadata.proficiency === 0 }">
                    熟练度: {{ mistake.metadata.proficiency }}
                  </div>
                  <div class="next-training">
                    下次训练: {{ formatDate(mistake.metadata.nextTrainingDate) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </el-skeleton>
  </div>

  <!-- 详情弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    width="80%"
    height="80vh"
    :show-close="true"
    :before-close="handleCloseDialog"
    class="mistake-detail-dialog"
    title=""
  >
    <div class="detail-container" v-if="activeItem">
      <!-- 添加计时器显示 -->
      <div class="timer-container">
        <div class="timer-display">
          <el-icon class="timer-icon"><Timer /></el-icon>
          <span class="timer-text">{{ formattedTime }}</span>
        </div>
      </div>
      
      <div class="mistake-section">
        <el-image 
          :src="activeItem.preview"
          :preview-src-list="[activeItem.preview]"
          fit="contain"
          class="detail-image"
        />
      </div>
      
      <div class="training-control" v-if="isTraining">
        <el-button-group>
          <el-button 
            type="success" 
            :icon="Check"
            @click="handleTrainingResult(true)"
            :loading="isSubmitting"
            :disabled="isSubmitting || !canTrain"
          >
            {{ isSubmitting ? '提交中...' : '记住了' }}
          </el-button>
          <el-button 
            type="danger" 
            :icon="Close"
            @click="handleTrainingResult(false)"
            :loading="isSubmitting"
            :disabled="isSubmitting || !canTrain"
          >
            {{ isSubmitting ? '提交中...' : '没记住' }}
          </el-button>
        </el-button-group>
        
        <!-- 添加训练状态提示 -->
        <div v-if="!canTrain" class="training-tip">
          下次训练时间未到
        </div>
        <div v-else-if="isSubmitting" class="training-tip submitting">
          正在提交训练结果...
        </div>
      </div>
      
      <div class="answer-control">
        <el-button 
          type="primary" 
          @click="showAnswer = !showAnswer"
          :disabled="showAnswer"
        >
          {{ showAnswer ? '已显示答案' : '显示答案' }}
        </el-button>
      </div>
      
      <div class="answer-section" v-if="showAnswer">
        <div v-for="(answer, index) in activeItem.answers"
             :key="index"
             class="answer-item">
          <el-image 
            :src="answer.preview"
            :preview-src-list="[answer.preview]"
            fit="contain"
            class="detail-image"
          />
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.exported-container {
  padding: 20px;
}

.export-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.export-item {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.export-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.15);
}

.export-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.export-actions {
  display: flex;
  gap: 8px;
}

/* 添加按钮动画效果 */
.export-actions .el-button {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.export-actions .el-button:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.date-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: #333;
  transition: all 0.3s ease;
}

.date-info:hover {
  color: var(--el-color-primary);
}

.date-info .el-icon {
  transition: transform 0.3s ease;
}

.date-info:hover .el-icon {
  transform: scale(1.2) rotate(5deg);
}

.count {
  color: #666;
  font-size: 14px;
  transition: all 0.3s ease;
}

.date-info:hover .count {
  color: var(--el-color-primary-light-3);
}

.mistakes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.mistake-item {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  padding: 4px;
  border: 2px solid transparent;
  /* 添加左边框样式来区分不同类型 */
  border-left-width: 4px;
}

.mistake-item:hover {
  transform: translateY(-5px) scale(1.03);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  z-index: 1;
}

.mistake-item:active {
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.preview-image {
  width: 100%;
  height: 200px;
  object-fit: contain;
  background: #f5f7fa;
  transition: all 0.3s ease;
}

.mistake-item:hover .preview-image {
  filter: brightness(1.05);
}

.image-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #f5f7fa;
  color: #909399;
}

.answer-count {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  transition: all 0.3s ease;
}

.mistake-item:hover .answer-count {
  background: rgba(0, 0, 0, 0.8);
  transform: scale(1.05);
}

.mistake-info {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  transition: all 0.3s ease;
}

.mistake-item:hover .mistake-info {
  background: rgba(0, 0, 0, 0.8);
  transform: scale(1.05);
}

.proficiency {
  margin-bottom: 4px;
  transition: color 0.3s ease;
}

.detail-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  animation: fadeInUp 0.4s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.mistake-section,
.answer-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.5s ease;
}

.detail-image {
  max-height: 60vh;
  width: auto;
  object-fit: contain;
  transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.detail-image:hover {
  transform: scale(1.02);
}

.answer-item {
  margin-top: 20px;
  width: 100%;
  display: flex;
  justify-content: center;
  animation: slideInUp 0.5s ease-out;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.training-control {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.training-control .el-button {
  padding: 12px 24px;
  font-size: 16px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.training-control .el-button:not(.is-disabled):hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.15);
}

.training-control .el-button:not(.is-disabled):active {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
}

.training-control .el-button + .el-button {
  margin-left: 16px;
}

.training-tip {
  margin-top: 10px;
  color: #909399;
  font-size: 14px;
  text-align: center;
  transition: all 0.3s ease;
}

.zero-proficiency {
  color: #f56c6c;
  font-weight: bold;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 1;
  }
}

.zero-proficiency-item {
  border: 2px solid #f56c6c !important;
  box-shadow: 0 0 8px rgba(245, 108, 108, 0.3);
  animation: pulseBorder 2s infinite;
}

@keyframes pulseBorder {
  0% {
    box-shadow: 0 0 8px rgba(245, 108, 108, 0.3);
  }
  50% {
    box-shadow: 0 0 15px rgba(245, 108, 108, 0.5);
  }
  100% {
    box-shadow: 0 0 8px rgba(245, 108, 108, 0.3);
  }
}

.zero-proficiency-item:hover {
  box-shadow: 0 0 12px rgba(245, 108, 108, 0.5) !important;
}

.warning-badge {
  position: absolute;
  top: 0;
  right: 0;
  background-color: #f56c6c;
  color: white;
  padding: 4px 8px;
  border-bottom-left-radius: 4px;
  font-size: 12px;
  z-index: 1;
  transition: all 0.3s ease;
}

.mistake-item:hover .warning-badge {
  background-color: #f78989;
  transform: scale(1.05);
}

.filter-bar {
  margin-bottom: 20px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.filter-bar:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.15);
}

.filter-bar .el-radio-button {
  transition: all 0.3s ease;
}

.filter-bar .el-radio-button:not(.is-active):hover {
  transform: translateY(-2px);
}

.selected-export {
  border-left-color: var(--el-color-primary);
}

.training-export {
  border-left-color: var(--el-color-success);
}

/* 添加类型标签样式 */
.export-type-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: white;
  z-index: 1;
  transition: all 0.3s ease;
}

.mistake-item:hover .export-type-badge {
  transform: scale(1.05);
}

.selected-badge {
  background-color: var(--el-color-primary);
}

.training-badge {
  background-color: var(--el-color-success);
}

/* 添加新的样式 */
.training-tip.submitting {
  color: var(--el-color-primary);
  font-weight: 500;
  animation: pulse 1.5s infinite;
}

.training-control .el-button.is-disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.mistake-detail-dialog :deep(.el-dialog__body) {
  padding: 0;
  height: 80vh;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.detail-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  position: relative;
}

.mistake-section,
.answer-section {
  width: 100%;
  height: calc(100% - 100px); /* 减去其他元素的高度 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.detail-image {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.answer-item {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.timer-container {
  position: absolute;
  top: -50px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 8px;
  background-color: transparent;
  border-radius: 8px;
  display: flex;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.timer-container:hover {
  transform: translateX(-50%) scale(1.05);
}

.timer-display {
  display: flex;
  align-items: center;
  font-size: 24px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 2px solid transparent;
  min-width: 180px;
  justify-content: center;
  background-color: transparent;
}

.timer-icon {
  margin-right: 8px;
  font-size: 24px;
  animation: rotateIcon 10s linear infinite;
}

@keyframes rotateIcon {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.timer-text {
  font-family: monospace;
  font-weight: bold;
  min-width: 120px;
  text-align: center;
}

/* 添加对话框动画 */
.mistake-detail-dialog :deep(.el-dialog) {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform: scale(0.9);
  opacity: 0;
}

.mistake-detail-dialog :deep(.el-dialog.dialog-fade-enter-active) {
  transform: scale(1);
  opacity: 1;
}

.mistake-detail-dialog :deep(.el-dialog.dialog-fade-leave-active) {
  transform: scale(0.9);
  opacity: 0;
}

/* 添加按钮组动画 */
.el-button-group .el-button {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.el-button-group .el-button:not(.is-disabled):hover {
  transform: translateY(-2px);
  z-index: 1;
}

/* 添加下拉菜单动画 */
.el-dropdown-menu {
  animation: dropdownFadeIn 0.3s ease-out;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 添加骨架屏动画 */
.el-skeleton {
  transition: opacity 0.5s ease;
}
</style> 