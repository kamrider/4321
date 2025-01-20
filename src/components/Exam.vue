<template>
  <div class="exam-container">
    <el-tabs>
      <el-tab-pane label="考试记录">
        <el-skeleton :loading="loading" animated :count="4">
          <template #default>
            <el-empty v-if="examList.length === 0" description="暂无考试记录" />
            <div v-else class="exam-list">
              <!-- 考试记录列表 -->
              <el-table :data="examList" style="width: 100%">
                <el-table-column prop="startTime" label="开始时间" width="180">
                  <template #default="{ row }">
                    {{ new Date(row.startTime).toLocaleString() }}
                  </template>
                </el-table-column>
                <el-table-column prop="status" label="状态" width="100">
                  <template #default="{ row }">
                    <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="items" label="题目数量" width="100">
                  <template #default="{ row }">
                    {{ row.items.length }}
                  </template>
                </el-table-column>
                <el-table-column label="操作">
                  <template #default="{ row }">
                    <el-button-group>
                      <el-button size="small" @click="viewExam(row)">查看</el-button>
                      <el-button size="small" type="danger" @click="deleteExam(row)">删除</el-button>
                    </el-button-group>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-skeleton>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ExamRecord, ExamStatus } from '../../electron/main/types'

const examList = ref<ExamRecord[]>([])
const loading = ref(false)

// 获取考试记录列表
const fetchExamList = async () => {
  loading.value = true
  try {
    const result = await window.electron.exam.getAll()
    if (result.success) {
      examList.value = result.data
    }
  } catch (error) {
    console.error('获取考试记录失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取状态标签类型
const getStatusType = (status: ExamStatus) => {
  const types = {
    ongoing: 'warning',
    paused: 'info',
    completed: 'success',
    abandoned: 'danger'
  }
  return types[status]
}

// 获取状态文本
const getStatusText = (status: ExamStatus) => {
  const texts = {
    ongoing: '进行中',
    paused: '已暂停',
    completed: '已完成',
    abandoned: '已放弃'
  }
  return texts[status]
}

// 查看考试详情
const viewExam = (exam: ExamRecord) => {
  // TODO: 实现查看考试详情
}

// 删除考试记录
const deleteExam = async (exam: ExamRecord) => {
  try {
    await ElMessageBox.confirm('确定要删除这条考试记录吗？', '警告', {
      type: 'warning'
    })
    const result = await window.electron.exam.delete(exam.id)
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

onMounted(() => {
  fetchExamList()
})
</script>

<style scoped>
.exam-container {
  padding: 20px;
}

.exam-list {
  margin-top: 20px;
}
</style> 