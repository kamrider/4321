<template>
  <div class="exam-container">
    <el-table
      v-loading="loading"
      :data="examList"
      style="width: 100%"
    >
      <el-table-column prop="id" label="考试ID" width="180" />
      <el-table-column prop="startTime" label="开始时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.startTime).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="题目数量" width="100">
        <template #default="{ row }">
          {{ row.items.length }}
        </template>
      </el-table-column>
      <el-table-column label="已用时间" width="120">
        <template #default="{ row }">
          {{ formatTime(row.usedTime) }}
        </template>
      </el-table-column>
      <el-table-column label="进度" width="180">
        <template #default="{ row }">
          <div class="progress-info">
            <el-progress 
              :percentage="getProgress(row)"
              :status="getProgressStatus(row.status)"
            />
            <span class="progress-text">
              {{ getCompletedCount(row) }}/{{ row.items.length }}
            </span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">
            {{ getStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button-group>
            <el-button 
              v-if="row.status === 'ongoing'"
              type="primary" 
              size="small" 
              @click="continueExam(row)"
            >
              继续考试
            </el-button>
            <el-button 
              type="info" 
              size="small" 
              @click="viewExamDetails(row)"
            >
              查看详情
            </el-button>
            <el-button 
              type="danger" 
              size="small" 
              @click="deleteExam(row)"
            >
              删除
            </el-button>
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ExamRecord, ExamStatus } from '../../electron/main/types'

const examList = ref<ExamRecord[]>([])
const loading = ref(false)

// 获取进度百分比
const getProgress = (exam: ExamRecord) => {
  const completed = exam.items.filter(item => 
    item.status === 'completed' || item.status === 'graded'
  ).length
  return Math.round((completed / exam.items.length) * 100)
}

// 获取进度条状态
const getProgressStatus = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'ongoing': return ''
    case 'abandoned': return 'exception'
    default: return ''
  }
}

// 继续考试
const continueExam = (exam: ExamRecord) => {
  // TODO: 实现继续考试逻辑
}

// 查看考试详情
const viewExamDetails = (exam: ExamRecord) => {
  // TODO: 实现查看详情逻辑
}

// 获取考试列表
const fetchExamList = async () => {
  try {
    loading.value = true
    const result = await window.ipcRenderer.exam.getAll()
    if (result.success) {
      examList.value = result.data
    }
  } catch (error) {
    console.error('获取考试列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取状态标签类型
const getStatusType = (status: ExamStatus) => {
  const types = {
    ongoing: 'warning',    // 黄色，表示进行中
    completed: 'success',  // 绿色，表示已完成
    abandoned: 'danger',   // 红色，表示已放弃
    paused: 'info'        // 蓝色，表示已暂停
  }
  return types[status]
}

// 获取状态文本
const getStatusText = (status: ExamStatus) => {
  const texts = {
    ongoing: '进行中',
    completed: '已完成',
    abandoned: '已放弃',
    paused: '已暂停'
  }
  return texts[status]
}

// 删除考试记录
const deleteExam = async (exam: ExamRecord) => {
  try {
    await ElMessageBox.confirm('确定要删除这条考试记录吗？', '警告', {
      type: 'warning'
    })
    const result = await window.ipcRenderer.exam.delete(exam.id)
    if (result.success) {
      ElMessage.success('删除成功')
      fetchExamList()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

// 格式化时间
const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}分${remainingSeconds}秒`
}

// 获取已完成题目数量
const getCompletedCount = (exam: ExamRecord) => {
  return exam.items.filter(item => 
    item.status === 'completed' || item.status === 'graded'
  ).length
}

onMounted(() => {
  fetchExamList()
})
</script>

<style scoped>
.exam-container {
  padding: 20px;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-text {
  font-size: 14px;
  color: #606266;
}

.exam-list {
  margin-top: 20px;
}
</style> 