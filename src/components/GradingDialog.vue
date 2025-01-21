<template>
  <el-dialog
    v-model="dialogVisible"
    title="试卷评分"
    width="80%"
    :close-on-click-modal="false"
  >
    <div class="grading-container" v-if="currentItem">
      <div class="progress-info">
        <span>第 {{ exam.gradingIndex + 1 }}/{{ exam.items.length }} 题</span>
      </div>

      <div class="question-area">
        <el-image
          :src="currentItem.preview"
          fit="contain"
          class="question-image"
        />
      </div>

      <div class="grading-actions">
        <el-button-group>
          <el-button
            type="success"
            size="large"
            @click="grade(true)"
          >
            正确
          </el-button>
          <el-button
            type="danger"
            size="large"
            @click="grade(false)"
          >
            错误
          </el-button>
        </el-button-group>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { ExamRecord, ExamItem } from '../../electron/main/types'

const props = defineProps<{
  modelValue: boolean
  exam: ExamRecord
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'finish-grading': []
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const currentItem = computed(() => 
  props.exam.items[props.exam.gradingIndex || 0]
)

// 评分
const grade = async (isCorrect: boolean) => {
  try {
    const index = props.exam.gradingIndex || 0
    const result = await window.ipcRenderer.exam.updateItem(props.exam.id, index, {
      status: 'graded',
      gradeResult: {
        isCorrect,
        gradedAt: new Date().toISOString()
      }
    })

    if (result.success) {
      if (index < props.exam.items.length - 1) {
        // 更新评分索引
        await window.ipcRenderer.exam.update(props.exam.id, {
          gradingIndex: index + 1
        })
      } else {
        // 评分完成
        await window.ipcRenderer.exam.update(props.exam.id, {
          isGrading: false,
          gradingIndex: undefined
        })
        ElMessage.success('评分完成')
        dialogVisible.value = false
        emit('finish-grading')
      }
    }
  } catch (error) {
    ElMessage.error('评分失败')
  }
}
</script>

<style scoped>
.grading-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.question-image {
  max-height: 70vh;
  object-fit: contain;
}

.grading-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
}
</style> 