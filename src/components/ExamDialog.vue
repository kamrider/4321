<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { MistakeItem as HistoryItem } from '../../electron/preload'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  examItems: HistoryItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'finish-exam': [results: Array<{ fileId: string, remembered: boolean }>]
}>()

// 计算属性用于处理 dialog 的显示状态
const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 考试相关状态
const currentIndex = ref(0)
const showAnswer = ref(false)
const time = ref(0)  // 单位为 10ms
const timerInterval = ref<number | null>(null)
const examId = ref<string>('')

// 答题记录
const examAnswers = ref<Array<{
  fileId: string,
  timeSpent: number,
  remembered: boolean | null
}>>([])

// 当前题目
const currentItem = computed(() => props.examItems[currentIndex.value])

// 开始考试
const startExam = async () => {
  console.log('Starting exam with items:', props.examItems)
  try {
    if (!props.examItems?.length) {
      throw new Error('没有选择考试题目')
    }
    
    const fileIds = props.examItems.map(item => item.fileId)
    console.log('File IDs:', fileIds)
    
    const result = await window.ipcRenderer.exam.start(fileIds)
    console.log('Exam start result:', result)
    
    if (result.success) {
      examId.value = result.data.id
      currentIndex.value = 0
      showAnswer.value = false
      startTimer()
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('开始考试失败:', error)
    ElMessage.error('开始考试失败')
    dialogVisible.value = false
  }
}

// 完成考试
const finishExam = async () => {
  if (!examId.value) return
  
  try {
    const result = await window.electron.exam.complete(examId.value)
    if (result.success) {
      ElMessage.success('考试完成')
      dialogVisible.value = false
      emit('finish-exam', [])  // TODO: 返回实际的考试结果
    }
  } catch (error) {
    ElMessage.error('完成考试失败')
  }
}

// 计时器相关逻辑
const startTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
  // 使用当前题目的 answerTimeLimit，转换为 10ms 单位
  const timeLimit = currentItem.value?.metadata?.answerTimeLimit || 30
  time.value = timeLimit * 100  // 转换为 10ms 单位
  
  timerInterval.value = setInterval(() => {
    if (time.value > 0) {
      time.value--
    } else {
      // 时间到，自动提交"没记住"
      submitAnswer(false)
    }
  }, 10)
}

// 手动下一题
const nextQuestion = async () => {
  if (currentIndex.value < props.examItems.length - 1) {
    // 记录当前题目的用时
    await window.electron.exam.updateItem(examId.value, currentIndex.value, {
      timeSpent: time.value / 100, // 转换为秒
      status: 'completed'
    })
    
    currentIndex.value++
    showAnswer.value = false
    startTimer() // 重新开始计时
  }
}

onMounted(() => {
  console.log('ExamDialog mounted, items:', props.examItems)
  if (dialogVisible.value) {
    startExam()
  }
})

watch(dialogVisible, (newValue) => {
  console.log('Dialog visible changed:', newValue, 'items:', props.examItems)
  if (newValue) {
    startExam()
  } else {
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
    }
  }
})
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="考试模式"
    width="80%"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <div class="exam-container" v-if="currentItem">
      <div class="progress-info">
        <span>第 {{ currentIndex + 1 }}/{{ examItems.length }} 题</span>
        <span class="timer" :class="{ 'warning': time < 1000 }">
          剩余时间：{{ Math.floor(time/100) }}秒
        </span>
      </div>

      <div class="question-area">
        <el-image
          :src="currentItem.preview"
          fit="contain"
          class="question-image"
        />
      </div>

      <div class="answer-actions">
        <el-button-group>
          <el-button
            v-if="currentIndex < examItems.length - 1"
            type="primary"
            size="large"
            @click="nextQuestion"
          >
            下一题
          </el-button>
          <el-button
            v-else
            type="success"
            size="large"
            @click="finishExam"
          >
            提交试卷
          </el-button>
        </el-button-group>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.exam-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 16px;
}

.question-area {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.question-image {
  max-height: 70vh;
  object-fit: contain;
}

.answer-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
}

.timer {
  color: #409EFF;
  font-weight: bold;
}

.timer.warning {
  color: #E6A23C;
}
</style> 