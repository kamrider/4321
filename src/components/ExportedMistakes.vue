<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Delete, Check, Close } from '@element-plus/icons-vue'

interface ExportedItem {
  date: string
  path: string
  mistakes: {
    path: string
    preview: string
    originalFileId?: string
    metadata?: any
    answers: Array<{
      path: string
      preview: string
      originalFileId?: string
      metadata?: any
    }>
  }[]
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

// 添加计算属性来判断是否可以训练
const canTrain = computed(() => {
  if (!activeItem.value?.metadata?.nextTrainingDate) {
    return false
  }
  
  const nextTrainingDate = new Date(activeItem.value.metadata.nextTrainingDate)
  const now = new Date()
  return nextTrainingDate <= now
})

onMounted(async () => {
  try {
    const result = await window.ipcRenderer.file.getExportedMistakes()
    if (result.success) {
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

const handleViewDetail = (item: ExportedItem['mistakes'][0]) => {
  activeItem.value = item
  dialogVisible.value = true
  showAnswer.value = false
  isTraining.value = true
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

// 添加训练相关的方法
const handleTrainingResult = async (remembered: boolean) => {
  if (!activeItem.value?.originalFileId) {
    ElMessage.warning('无法找到原始错题信息')
    return
  }

  try {
    const result = await window.ipcRenderer.training.submitResult(
      activeItem.value.originalFileId,
      remembered
    )

    if (result.success) {
      ElMessage.success(remembered ? '太棒了！继续保持！' : '没关系，下次继续加油！')
      
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
  }
}
</script>

<template>
  <div class="exported-container">
    <el-empty v-if="!loading && exportedList.length === 0" description="暂无导出记录" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="export-list">
          <div v-for="item in exportedList" 
               :key="item.date" 
               class="export-item">
            <div class="export-header">
              <div class="date-info">
                <el-icon><Document /></el-icon>
                <span>{{ formatDate(item.date) }}</span>
                <span class="count">(共 {{ item.mistakes.length }} 题)</span>
              </div>
              <el-button 
                type="danger" 
                :icon="Delete"
                circle
                @click="handleDelete(item.date)"
              />
            </div>
            
            <div class="mistakes-grid">
              <div v-for="mistake in item.mistakes"
                   :key="mistake.path"
                   class="mistake-item"
                   @click="handleViewDetail(mistake)">
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
                  <div class="proficiency">
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
    title="错题详情"
    width="80%"
  >
    <div class="detail-container" v-if="activeItem">
      <div class="mistake-section">
        <el-image 
          :src="activeItem.preview"
          :preview-src-list="[activeItem.preview]"
          fit="contain"
          class="detail-image"
        />
      </div>
      
      <div class="training-control" v-if="isTraining && !showAnswer">
        <el-button-group>
          <el-button 
            type="success" 
            :icon="Check"
            @click="handleTrainingResult(true)"
            :disabled="!canTrain"
          >
            记住了
          </el-button>
          <el-button 
            type="danger" 
            :icon="Close"
            @click="handleTrainingResult(false)"
            :disabled="!canTrain"
          >
            没记住
          </el-button>
        </el-button-group>
        <div v-if="!canTrain" class="training-tip">
          下次训练时间未到
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
}

.export-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eee;
}

.date-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: #333;
}

.count {
  color: #666;
  font-size: 14px;
}

.mistakes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.mistake-item {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
}

.mistake-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.preview-image {
  width: 100%;
  height: 200px;
  object-fit: contain;
  background: #f5f7fa;
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
}

.proficiency {
  margin-bottom: 4px;
}

.detail-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.mistake-section,
.answer-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.detail-image {
  max-height: 60vh;
  width: auto;
  object-fit: contain;
}

.answer-item {
  margin-top: 20px;
  width: 100%;
  display: flex;
  justify-content: center;
}

.training-control {
  margin-top: 20px;
}

.training-control .el-button {
  padding: 12px 24px;
  font-size: 16px;
}

.training-control .el-button + .el-button {
  margin-left: 16px;
}

.training-tip {
  margin-top: 10px;
  color: #909399;
  font-size: 14px;
  text-align: center;
}
</style> 