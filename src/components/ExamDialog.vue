<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MistakeItem as HistoryItem } from '../../electron/preload'

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
const time = ref(0)
const timerInterval = ref<number | null>(null)

// 答题记录
const examAnswers = ref<Array<{
  fileId: string,
  timeSpent: number,
  remembered: boolean | null
}>>([])

// 当前题目
const currentItem = computed(() => props.examItems[currentIndex.value])

// 开始考试
const startExam = () => {
  currentIndex.value = 0
  examAnswers.value = props.examItems.map(item => ({
    fileId: item.fileId,
    timeSpent: 0,
    remembered: null
  }))
  startTimer()
}

// 计时器相关逻辑
const startTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
  time.value = 0
  timerInterval.value = setInterval(() => {
    time.value++
  }, 10)
}
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
    <!-- 考试内容区域 -->
  </el-dialog>
</template> 