<template>
  <div class="schulte-grid-container">
    <div class="controls">
      <el-button type="primary" @click="startGame" :disabled="isPlaying">
        开始游戏
      </el-button>
      <div class="timer" v-if="isPlaying">
        {{ formatTime(timer) }}
      </div>
    </div>
    
    <div class="grid" :class="{ 'is-playing': isPlaying }">
      <div v-for="(number, index) in gridNumbers" 
           :key="index" 
           class="grid-cell"
           :class="{ 'correct': isNumberCorrect(number) }"
           @click="handleNumberClick(number)">
        {{ number }}
      </div>
    </div>

    <div class="status" v-if="isPlaying">
      <div class="next-number">
        下一个数字: {{ currentNumber }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  gridSize?: number  // 方格大小，默认5x5
  timeLimit?: number // 时间限制（秒）
}>()

const emit = defineEmits<{
  (e: 'complete', time: number): void  // 完成时发出事件
}>()

// 状态变量
const isPlaying = ref(false)
const timer = ref(0)
const currentNumber = ref(1)
const gridNumbers = ref<number[]>([])
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null)

// 计算默认大小
const size = computed(() => props.gridSize || 5)

// 生成随机数字数组
const generateNumbers = () => {
  const numbers = Array.from({ length: size.value * size.value }, (_, i) => i + 1)
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]]
  }
  return numbers
}

// 开始游戏
const startGame = () => {
  isPlaying.value = true
  currentNumber.value = 1
  timer.value = 0
  gridNumbers.value = generateNumbers()
  
  // 开始计时
  timerInterval.value = setInterval(() => {
    timer.value += 10
  }, 10)
}

// 检查数字是否已经被正确点击
const isNumberCorrect = (number: number) => {
  return number < currentNumber.value
}

// 处理数字点击
const handleNumberClick = (number: number) => {
  if (!isPlaying.value) return
  
  if (number === currentNumber.value) {
    if (number === size.value * size.value) {
      // 游戏完成
      endGame()
    } else {
      currentNumber.value++
    }
  } else {
    // 点错了，给出提示
    ElMessage.error('顺序错误，请点击数字 ' + currentNumber.value)
  }
}

// 结束游戏
const endGame = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
  isPlaying.value = false
  emit('complete', timer.value)
  ElMessage.success('恭喜完成！用时：' + formatTime(timer.value))
}

// 格式化时间显示
const formatTime = (time: number) => {
  const totalMs = time
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const ms = Math.floor((totalMs % 1000) / 10)
  return minutes.toString().padStart(2, '0') + ':' + 
         seconds.toString().padStart(2, '0') + '.' + 
         ms.toString().padStart(2, '0')
}
</script>

<style scoped>
.schulte-grid-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 20px;
}

.controls {
  display: flex;
  gap: 20px;
  align-items: center;
}

.timer {
  font-size: 24px;
  font-family: monospace;
  color: #409EFF;
}

.grid {
  display: grid;
  grid-template-columns: repeat(v-bind(size), 1fr);
  gap: 8px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.grid-cell {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 4px;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.3s;
  user-select: none;
}

.grid-cell:hover {
  background: #ecf5ff;
}

.grid-cell.correct {
  background: #f0f9eb;
  color: #67c23a;
}

.status {
  font-size: 18px;
  color: #606266;
}

.next-number {
  font-weight: bold;
  color: #409EFF;
}
</style>

export default defineComponent({
  name: 'SchulteGrid'
}) 