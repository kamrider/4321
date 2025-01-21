<template>
  <el-dialog
    v-model="dialogVisible"
    title="试卷评分"
    width="90%"
    :close-on-click-modal="false"
  >
    <div class="grading-content">
      <div class="images-container">
        <!-- 题目预览 -->
        <div class="image-section">
          <h3>题目</h3>
          <el-image 
            :src="currentItem?.preview"
            :preview-src-list="[]"
            fit="contain"
            class="preview-image"
          />
        </div>
        
        <!-- 正确答案 -->
        <div class="image-section">
          <h3>正确答案</h3>
          <el-image 
            :src="currentItem?.metadata?.answer"
            :preview-src-list="[]"
            fit="contain"
            class="preview-image"
          />
        </div>
      </div>
      
      <!-- 评分操作 -->
      <div class="grading-actions">
        <el-button type="success" @click="markAsCorrect">正确</el-button>
        <el-button type="danger" @click="markAsWrong">错误</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ExamRecord, ExamItem } from '../../electron/main/types'

const props = defineProps<{
  exam: {
    items: any[]
    gradingIndex: number
  }
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'finish-grading': []
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

// 使用 ref 来存储预览 URL
const previewUrl = ref('')

// 使用 watch 来更新预览 URL
watch(() => props.exam.items[props.exam.gradingIndex || 0], async (item) => {
  if (!item) return
  
  const result = await window.ipcRenderer.exam.getPreviewPath(item.preview)
  previewUrl.value = result.success ? result.data : item.preview
}, { immediate: true })

// computed 返回当前项
const currentItem = computed(() => {
  const item = props.exam.items[props.exam.gradingIndex || 0]
  if (!item) return null
  
  return {
    ...item,
    preview: previewUrl.value
  }
})

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
          status: 'graded',
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

const handleStartGrading = async () => {
  console.log('开始评卷', props.exam)
}

const markAsCorrect = () => {
  grade(true)
}

const markAsWrong = () => {
  grade(false)
}
</script>

<style scoped>
.grading-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.images-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.image-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-image {
  width: 100%;
  height: 400px;
  object-fit: contain;
  border: 1px solid #eee;
}

.grading-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
}
</style> 