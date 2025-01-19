<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { Timer, Bell, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
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

// 添加提醒相关的响应式变量
const hasReachedOneMinute = ref(false)
const audioContext = ref<AudioContext | null>(null)

// 添加排序相关的状态
const sortType = ref<'time' | 'proficiency'>('proficiency')
const sortOrder = ref<'asc' | 'desc'>('asc')

// 添加计时器状态管理
const timerStates = ref(new Map<string, number>())

// 添加当前项目索引
const currentIndex = ref(0)

// 保存当前计时状态
const saveCurrentTimerState = () => {
  if (activeItem.value) {
    timerStates.value.set(activeItem.value.fileId, time.value)
  }
}

// 添加启动计时器的函数
const startTimer = () => {
  // 清理已存在的计时器
  if (timerInterval.value) {
    clearInterval(timerInterval.value)
  }
  // 启动新的计时器，每10ms更新一次
  timerInterval.value = setInterval(() => {
    time.value++
  }, 10)
}

// 修改加载计时状态的函数
const loadTimerState = (fileId: string) => {
  time.value = timerStates.value.get(fileId) || 0
  startTimer() // 加载状态后启动计时器
}

// 添加切换处理函数
const handlePrevious = () => {
  if (currentIndex.value > 0) {
    saveCurrentTimerState()
    currentIndex.value--
    activeItem.value = sortedHistoryList.value[currentIndex.value]
    loadTimerState(activeItem.value.fileId)
  }
}

const handleNext = () => {
  if (currentIndex.value < sortedHistoryList.value.length - 1) {
    saveCurrentTimerState()
    currentIndex.value++
    activeItem.value = sortedHistoryList.value[currentIndex.value]
    loadTimerState(activeItem.value.fileId)
  }
}

// 添加排序后的列表计算属性
const sortedHistoryList = computed(() => {
  if (!historyList.value) return []
  
  return [...historyList.value].sort((a, b) => {
    if (sortType.value === 'time') {
      const timeA = new Date(a.uploadDate).getTime()
      const timeB = new Date(b.uploadDate).getTime()
      return sortOrder.value === 'desc' ? timeB - timeA : timeA - timeB
    } else {
      const profA = a.metadata?.proficiency || 0
      const profB = b.metadata?.proficiency || 0
      return sortOrder.value === 'desc' ? profB - profA : profA - profB
    }
  })
})

// 添加排序处理函数
const handleSort = (type: 'time' | 'proficiency') => {
  if (sortType.value === type) {
    // 如果点击相同类型，切换排序顺序
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  } else {
    // 如果点击不同类型，设置新类型并默认降序
    sortType.value = type
    sortOrder.value = 'desc'
  }
}

// 添加音符频率常量
const NOTES = {
  DO: 523.25,  // C5
  RE: 587.33,  // D5
  MI: 659.25,  // E5
  FA: 698.46,  // F5
  SOL: 783.99, // G5
  LA: 880.00,  // A5
  SI: 987.77,  // B5
  DO_HIGH: 1046.50 // C6
}

// 添加时间颜色配置
const TIME_COLORS = {
  1: { color: '#67C23A', background: 'rgba(103, 194, 58, 0.1)' },   // 绿色 (0-1分钟)
  2: { color: '#409EFF', background: 'rgba(64, 158, 255, 0.1)' },   // 蓝色 (1-2分钟)
  3: { color: '#E6A23C', background: 'rgba(230, 162, 60, 0.1)' },   // 橙色 (2-3分钟)
  4: { color: '#F56C6C', background: 'rgba(245, 108, 108, 0.1)' },  // 红色 (3-4分钟)
  5: { color: '#9B59B6', background: 'rgba(155, 89, 182, 0.1)' },   // 紫色 (4-5分钟)
  max: { color: '#303133', background: 'rgba(48, 49, 51, 0.1)' }    // 深灰色 (5分钟以上)
}

// 添加计算当前颜色的函数
const currentTimeColor = computed(() => {
  const minutes = Math.floor((time.value * 10) / 60000) + 1 // 将毫秒转换为分钟
  const colorKey = minutes <= 5 ? minutes : 'max'
  return TIME_COLORS[colorKey]
})

// 格式化时间显示，包含毫秒
const formattedTime = computed(() => {
  const totalMs = time.value * 10 // 因为我们每10ms更新一次
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const ms = Math.floor((totalMs % 1000) / 10)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
})

// 添加键盘事件处理函数
const handleKeydown = (event: KeyboardEvent) => {
  // 只在弹窗打开时处理键盘事件
  if (!dialogVisible.value) return
  
  switch (event.key) {
    case 'ArrowLeft':
      handlePrevious()
      break
    case 'ArrowRight':
      handleNext()
      break
  }
}

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
  
  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeydown)
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

// 修改查看详情处理函数
const handleViewDetail = (item: HistoryItem) => {
  if (activeItem.value) {
    saveCurrentTimerState()
  }
  currentIndex.value = sortedHistoryList.value.findIndex(i => i.fileId === item.fileId)
  activeItem.value = item
  loadTimerState(item.fileId)
  dialogVisible.value = true
  showAnswer.value = false
}

// 修改关闭弹窗处理函数
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
  
  // 移除键盘事件监听
  window.removeEventListener('keydown', handleKeydown)
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

// 添加音乐组合配置
const MELODIES = {
  1: [ // 第1分钟：Do Re Mi
    { freq: NOTES.DO, duration: 0.2 },
    { freq: NOTES.RE, duration: 0.2 },
    { freq: NOTES.MI, duration: 0.3 }
  ],
  2: [ // 第2分钟：Mi Fa So
    { freq: NOTES.MI, duration: 0.2 },
    { freq: NOTES.FA, duration: 0.2 },
    { freq: NOTES.SOL, duration: 0.3 }
  ],
  3: [ // 第3分钟：So La Si
    { freq: NOTES.SOL, duration: 0.2 },
    { freq: NOTES.LA, duration: 0.2 },
    { freq: NOTES.SI, duration: 0.3 }
  ],
  4: [ // 第4分钟：La Si Do高
    { freq: NOTES.LA, duration: 0.2 },
    { freq: NOTES.SI, duration: 0.2 },
    { freq: NOTES.DO_HIGH, duration: 0.3 }
  ],
  5: [ // 第5分钟：完整音阶 Do Re Mi Fa So
    { freq: NOTES.DO, duration: 0.15 },
    { freq: NOTES.RE, duration: 0.15 },
    { freq: NOTES.MI, duration: 0.15 },
    { freq: NOTES.FA, duration: 0.15 },
    { freq: NOTES.SOL, duration: 0.3 }
  ],
  max: [ // 5分钟以上：完整音阶 Fa So La Si Do高
    { freq: NOTES.FA, duration: 0.15 },
    { freq: NOTES.SOL, duration: 0.15 },
    { freq: NOTES.LA, duration: 0.15 },
    { freq: NOTES.SI, duration: 0.15 },
    { freq: NOTES.DO_HIGH, duration: 0.3 }
  ]
}

// 修改音效播放函数
const playMelody = async () => {
  try {
    if (!audioContext.value) {
      audioContext.value = new AudioContext()
    }

    const ctx = audioContext.value
    const now = ctx.currentTime
    
    // 创建音量控制
    const masterGain = ctx.createGain()
    masterGain.gain.value = 0.3 // 设置整体音量
    masterGain.connect(ctx.destination)

    // 根据当前分钟数选择音乐
    const minutes = Math.floor((time.value * 10) / 60000) + 1
    const melodyKey = minutes <= 5 ? minutes : 'max'
    const notes = MELODIES[melodyKey]

    notes.forEach((note, index) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      
      // 使用正弦波
      osc.type = 'sine'
      osc.frequency.value = note.freq
      
      // 设置音量包络
      gain.gain.setValueAtTime(0, now + index * note.duration)
      gain.gain.linearRampToValueAtTime(0.3, now + index * note.duration + 0.05)
      gain.gain.linearRampToValueAtTime(0, now + (index + 1) * note.duration)
      
      // 连接节点
      osc.connect(gain)
      gain.connect(masterGain)
      
      // 开始和结束
      osc.start(now + index * note.duration)
      osc.stop(now + (index + 1) * note.duration)
    })
  } catch (error) {
    console.error('播放提示音失败:', error)
  }
}

// 修改时间监听函数
watch(time, (newValue) => {
  // 每分钟（6000 * 10ms = 1分钟）触发一次
  if (newValue > 0 && newValue % 6000 === 0) {
    playMelody()
    // 计算当前分钟数
    const minutes = Math.floor(newValue / 6000)
    const timeColor = TIME_COLORS[Math.min(minutes, 'max')]
    ElMessage({
      message: `已经练习 ${minutes} 分钟了，继续加油！`,
      type: minutes <= 2 ? 'success' : minutes <= 4 ? 'warning' : 'error',
      duration: 3000
    })
  }
})
</script>

<template>
  <div class="mistake-container">
    <!-- 添加顶部导航栏 -->
    <div class="nav-header">
      <div class="sort-controls">
        <el-button-group>
          <el-button 
            :type="sortType === 'time' ? 'primary' : 'default'"
            @click="handleSort('time')"
          >
            上传时间
            <el-icon v-if="sortType === 'time'">
              <component :is="sortOrder === 'desc' ? 'ArrowDown' : 'ArrowUp'" />
            </el-icon>
          </el-button>
          <el-button 
            :type="sortType === 'proficiency' ? 'primary' : 'default'"
            @click="handleSort('proficiency')"
          >
            熟练度
            <el-icon v-if="sortType === 'proficiency'">
              <component :is="sortOrder === 'desc' ? 'ArrowDown' : 'ArrowUp'" />
            </el-icon>
          </el-button>
        </el-button-group>
      </div>
      
      <div class="header-actions">
        <el-button type="primary" @click="exportHistory" :loading="loading">
          导出训练历史
        </el-button>
      </div>
    </div>

    <el-empty v-if="!loading && sortedHistoryList.length === 0" description="暂无错题" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="preview-area">
          <div v-for="item in sortedHistoryList" 
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
    <div class="detail-container" v-if="activeItem">
      <!-- 添加顶部导航按钮 -->
      <div class="navigation-buttons">
        <el-button
          class="nav-button"
          :disabled="currentIndex === 0"
          @click="handlePrevious"
          circle
        >
          <el-icon><ArrowLeft /></el-icon>
        </el-button>

        <el-button
          class="nav-button"
          :disabled="currentIndex === sortedHistoryList.length - 1"
          @click="handleNext"
          circle
        >
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>

      <!-- 保持原有的计时器显示 -->
      <div class="timer-container">
        <div class="timer-display" 
             :style="{ 
               color: currentTimeColor.color,
               backgroundColor: currentTimeColor.background,
               borderColor: currentTimeColor.color
             }"
        >
          <el-icon class="timer-icon" :style="{ color: currentTimeColor.color }">
            <Timer />
          </el-icon>
          <span class="timer-text">{{ formattedTime }}</span>
          <el-icon v-if="time > 0" class="bell-icon" :style="{ color: currentTimeColor.color }">
            <Bell />
          </el-icon>
        </div>
      </div>

      <!-- 主要内容区域 -->
      <div class="mistake-section">
        <!-- 左侧按钮 -->
        <el-button 
          class="side-button left-button"
          type="success" 
          size="large"
          round
          :disabled="activeItem && formatTrainingStatus(activeItem.metadata.nextTrainingDate).status === 'pending'"
          @click="activeItem && submitTraining(activeItem.fileId, true)"
        >
          记住了
        </el-button>

        <!-- 图片 -->
        <el-image 
          :src="activeItem.preview"
          :preview-src-list="[activeItem.preview]"
          fit="contain"
          class="detail-image"
        />

        <!-- 右侧按钮 -->
        <el-button 
          class="side-button right-button"
          type="danger" 
          size="large"
          round
          :disabled="activeItem && formatTrainingStatus(activeItem.metadata.nextTrainingDate).status === 'pending'"
          @click="activeItem && submitTraining(activeItem.fileId, false)"
        >
          没记住
        </el-button>
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

/* 修改弹窗相关样式 */
.mistake-detail-dialog {
  display: flex;
  justify-content: center;
}

.mistake-detail-dialog :deep(.el-dialog__body) {
  padding: 0;
  height: 90vh;
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
  position: relative;
}

.timer-container {
  width: 100%;
  padding: 8px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  justify-content: center;
}

.timer-display {
  display: flex;
  align-items: center;
  font-size: 28px;
  transition: all 0.5s ease;
  padding: 6px 16px;
  border-radius: 6px;
  border: 2px solid transparent;
  min-width: 200px;
  justify-content: center;
  background-color: white;
}

.timer-icon {
  margin-right: 8px;
  font-size: 24px;
  transition: color 0.5s ease;
}

.bell-icon {
  margin-left: 8px;
  font-size: 24px;
  transition: color 0.5s ease;
  animation: shake 1.5s infinite;
}

.timer-text {
  font-family: monospace;
  font-weight: bold;
  min-width: 120px;
  text-align: center;
}

/* 优化动画效果 */
@keyframes shake {
  0%, 100% {
    transform: rotate(0);
  }
  25% {
    transform: rotate(8deg);
  }
  75% {
    transform: rotate(-8deg);
  }
}

/* 添加颜色过渡动画 */
@keyframes colorPulse {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.02);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.timer-display {
  animation: colorPulse 2s infinite;
}

.mistake-section {
  flex: 1;
  width: 100%;
  height: calc(100% - 120px);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 20px 60px;
}

.detail-image {
  height: calc(90vh - 80px);
  width: auto;
  object-fit: contain;
  background-color: #f5f7fa;
}

.side-button {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}

.left-button {
  left: 10px;
}

.right-button {
  right: 10px;
}

.answer-control {
  padding: 16px;
  display: flex;
  justify-content: center;
}

.answer-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.answer-item {
  width: 100%;
  display: flex;
  justify-content: center;
  margin: 10px 0;
}

.answer-item .detail-image {
  height: calc(90vh - 80px);
  width: auto;
  object-fit: contain;
  background-color: #f5f7fa;
}

.nav-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 0 20px;
  background-color: var(--el-bg-color);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-lighter);
  height: 60px;
}

.sort-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.sort-controls .el-button-group {
  margin-right: 12px;
}

.sort-controls .el-button {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sort-controls .el-icon {
  margin-left: 4px;
}

.navigation-buttons {
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
  z-index: 2;
}

.nav-button {
  background-color: rgba(255, 255, 255, 0.8);
  border: none;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.nav-button:hover {
  background-color: rgba(255, 255, 255, 0.9);
}

.nav-button.is-disabled {
  background-color: rgba(255, 255, 255, 0.5);
}
</style> 