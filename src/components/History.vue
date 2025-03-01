<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, defineComponent } from 'vue'
import { Timer, Bell, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Check, Close } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { MistakeItem as HistoryItem, TrainingRecord, ExportMistakeParams } from '../../electron/preload'
import SchulteGrid from './SchulteGrid.vue'

const historyList = ref<HistoryItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// 添加预览相关的响应式变量
const dialogVisible = ref(false)
const activeItem = ref<HistoryItem | null>(null)
const showAnswer = ref(false)

// 添加计时器相关的响应式变量
const time = ref(0)
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null)

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

// 在现有的响应式变量声明后添加
const metadataDialogVisible = ref(false)
const selectedItem = ref<HistoryItem | null>(null)

// 考试模式相关的状态
const isExamMode = ref(false)
const selectedExamItems = ref<HistoryItem[]>([])
const currentExamIndex = ref(0)
const isInExam = ref(false)

// 在其他 ref 变量声明后添加
const showAnswerButtons = ref(false)

// 在现有的响应式变量声明后添加
const countdown = ref<number>(0)  // 倒计时剩余时间（秒）
const countdownInterval = ref<ReturnType<typeof setInterval> | null>(null)  // 倒计时定时器
const isCountdownRunning = ref(false)  // 倒计时状态

// 添加编辑状态
const isEditing = ref(false)
const editingMetadata = ref({
  answerTimeLimit: 300,
  subject: '',
  tags: [] as string[]
})
const existingTags = ref<string[]>([])

// 添加导出模式相关的状态
const isExportMode = ref(false)
const selectedExportItems = ref<HistoryItem[]>([])

// 在其他响应式变量声明后添加
const isAttentionMode = ref(true)  // 修改为默认开启

// 添加舒尔特方格相关的状态
const showSchulteGrid = ref(false)
const schulteGridSize = ref(5)
const schulteTimeLimit = ref(18)  // 修改默认时间为20秒

// 添加提交状态
const isSubmitting = ref(false)

// 添加训练状态
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

// 计算已选题目的总时间
const totalExamTime = computed(() => {
  return selectedExamItems.value.reduce((total, item) => {
    return total + (item.metadata.answerTimeLimit || 300)
  }, 0)
})

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

// 修改切换处理函数
const handlePrevious = () => {
  if (isInExam.value) {
    if (currentExamIndex.value > 0) {
      currentExamIndex.value--
      const prevItem = selectedExamItems.value[currentExamIndex.value]
      if (isAttentionMode.value) {
        activeItem.value = prevItem // 先设置 activeItem
        dialogVisible.value = false // 关闭当前题目
        showSchulteGrid.value = true // 显示舒尔特方格
      } else {
        handleViewDetail(prevItem)
      }
    }
  } else {
    if (currentIndex.value > 0) {
      if (activeItem.value) {
        saveCurrentTimerState()
      }
      currentIndex.value--
      const prevItem = sortedHistoryList.value[currentIndex.value]
      if (isAttentionMode.value) {
        activeItem.value = prevItem // 先设置 activeItem
        dialogVisible.value = false // 关闭当前题目
        showSchulteGrid.value = true // 显示舒尔特方格
      } else {
        activeItem.value = prevItem
        loadTimerState(prevItem.fileId)
        
        // 重置状态
        showAnswer.value = false
        showAnswerButtons.value = false
        
        // 重新初始化倒计时
        if (prevItem.metadata?.answerTimeLimit) {
          countdown.value = prevItem.metadata.answerTimeLimit
          startCountdown()
        }
      }
    }
  }
}

const handleNext = () => {
  if (isInExam.value) {
    if (currentExamIndex.value < selectedExamItems.value.length - 1) {
      currentExamIndex.value++
      const nextItem = selectedExamItems.value[currentExamIndex.value]
      if (isAttentionMode.value) {
        activeItem.value = nextItem // 先设置 activeItem
        dialogVisible.value = false // 关闭当前题目
        showSchulteGrid.value = true // 显示舒尔特方格
      } else {
        handleViewDetail(nextItem)
      }
    }
  } else {
    if (currentIndex.value < sortedHistoryList.value.length - 1) {
      if (activeItem.value) {
        saveCurrentTimerState()
      }
      currentIndex.value++
      const nextItem = sortedHistoryList.value[currentIndex.value]
      if (isAttentionMode.value) {
        activeItem.value = nextItem // 先设置 activeItem
        dialogVisible.value = false // 关闭当前题目
        showSchulteGrid.value = true // 显示舒尔特方格
      } else {
        activeItem.value = nextItem
        loadTimerState(nextItem.fileId)
        
        // 重置状态
        showAnswer.value = false
        showAnswerButtons.value = false
        
        // 重新初始化倒计时
        if (nextItem.metadata?.answerTimeLimit) {
          countdown.value = nextItem.metadata.answerTimeLimit
          startCountdown()
        }
      }
    }
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
      minute: '2-digit'
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

// 修改训练结果提交函数
const handleTrainingResult = async (remembered: boolean) => {
  // 保留原有的防抖和检查逻辑
  if (isSubmitting.value) return
  
  try {
    isSubmitting.value = true
    
    if (!activeItem.value?.fileId) {
      ElMessage.warning('无法找到错题信息')
      return
    }

    const loadingMessage = ElMessage({
      message: '正在提交训练结果...',
      type: 'info',
      duration: 0
    })

    // 添加导出逻辑
    if (!remembered) {
      const mistakeResult = await window.ipcRenderer.file.getMistakeDetails(activeItem.value.fileId)
      if (!mistakeResult.success) {
        throw new Error('获取错题详情失败')
      }

      const exportResult = await window.ipcRenderer.file.exportMistake({
        mistake: mistakeResult.data,
        answer: mistakeResult.data.metadata?.pairedWith,
        exportTime: new Date().toISOString(),
        exportType: 'training'
      })

      if (!exportResult.success) {
        throw new Error(exportResult.error || '导出失败')
      }
      
      ElMessage.success('已自动导出到错题本')
    }

    // 保留原有的训练结果提交逻辑
    const result = await window.ipcRenderer.training.submitResult(
      activeItem.value.fileId,
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
          activeItem.value.fileId
        )
        if (nextTraining.success) {
          activeItem.value.metadata.proficiency = nextTraining.data.currentProficiency
          activeItem.value.metadata.trainingInterval = nextTraining.data.currentInterval
          activeItem.value.metadata.nextTrainingDate = nextTraining.data.nextTrainingDate
        }
      }
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('提交训练结果失败:', error)
    ElMessage.error('提交训练结果失败')
  } finally {
    // 保留原有的延迟重置状态逻辑
    setTimeout(() => {
      isSubmitting.value = false
    }, 500)
  }
}

// 修改查看详情处理函数
const handleViewDetail = async (item: HistoryItem) => {
  // 检查是否被冻结
  if (item.metadata?.isFrozen) {
    ElMessage.warning('该项目已被冻结，无法训练')
    return
  }

  // 如果是注意力模式，先显示舒尔特方格
  if (isAttentionMode.value) {
    activeItem.value = item // 先设置 activeItem
    showSchulteGrid.value = true
    return
  }

  showActualDetail(item)
}

// 添加显示实际详情的函数
const showActualDetail = (item: HistoryItem) => {
  if (activeItem.value) {
    saveCurrentTimerState()
  }
  currentIndex.value = sortedHistoryList.value.findIndex(i => i.fileId === item.fileId)
  activeItem.value = item
  dialogVisible.value = true
  showAnswer.value = false
  showAnswerButtons.value = false
  
  // 设置训练状态
  isTraining.value = true
  
  // 恢复原来的计时方式，不管是否在注意力模式下都立即开始计时
  loadTimerState(item.fileId)
  // 初始化倒计时
  if (item.metadata?.answerTimeLimit) {
    countdown.value = item.metadata.answerTimeLimit
    startCountdown()
  }
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
  showAnswerButtons.value = false
  isTraining.value = false
  stopCountdown()  // 添加这行
}

// 添加切换答案显示的函数
const toggleAnswer = async () => {
  showAnswer.value = !showAnswer.value
  
  // 只在显示答案时执行以下逻辑
  if (showAnswer.value) {
    showAnswerButtons.value = true
    
    // 使用实际计时器的时间来计算
    const usedTime = Math.ceil(time.value / 100) // 因为time是以10ms为单位的
    
    // 只有在倒计时内完成或继续做的情况下才更新时限
    if (isCountdownRunning.value || time.value > 0) {
      // 计算新的答题时限
      let newTimeLimit = usedTime
      const minutes = usedTime / 60 // 转换为分钟

      // 根据完成时间动态调整下一次的时限
      if (minutes <= 1) {
        newTimeLimit = Math.max(30, usedTime - 5) // 减5秒，但不少于30秒
      } else if (minutes <= 2) {
        newTimeLimit = Math.max(30, usedTime - 10) // 减10秒
      } else if (minutes <= 5) {
        newTimeLimit = Math.max(30, usedTime - 20) // 减20秒
      } else if (minutes <= 7) {
        newTimeLimit = Math.max(30, usedTime - 40) // 减40秒
      } else if (minutes <= 10) {
        newTimeLimit = Math.max(30, usedTime - 60) // 减1分钟
      } else if (minutes <= 15) {
        newTimeLimit = Math.max(30, usedTime - 90) // 减1.5分钟
      }

      try {
        const result = await window.ipcRenderer.metadata.updateDetails(
          activeItem.value!.fileId,
          newTimeLimit
        )
        
        if (result.success) {
          if (activeItem.value?.metadata) {
            activeItem.value.metadata.answerTimeLimit = newTimeLimit
          }
          // 显示调整后的时限
          const adjustment = usedTime - newTimeLimit
          if (adjustment > 0) {
            ElMessage.success(`本次用时 ${usedTime} 秒，下次时限调整为 ${newTimeLimit} 秒（减少 ${adjustment} 秒）`)
          } else {
            ElMessage.success(`答题时限已更新为 ${newTimeLimit} 秒`)
          }
        }
      } catch (error) {
        console.error('更新答题时限失败:', error)
      }
    }
    stopCountdown()
  }
}

// 添加导出函数
const exportHistory = async () => {
  try {
    loading.value = true
    
    // 在导出模式下，只导出选中的项目
    if (isExportMode.value && selectedExportItems.value.length > 0) {
      try {
        // 准备批量导出的数据
        const mistakesToExport = []
        
        // 收集所有选中的错题及其答案
        for (const item of selectedExportItems.value) {
          // 获取当前错题的完整信息
          const mistakeResult = await window.ipcRenderer.file.getMistakeDetails(item.fileId)
          if (!mistakeResult.success) {
            throw new Error('获取错题详情失败')
          }
          
          // 添加到导出列表
          mistakesToExport.push({
            mistake: mistakeResult.data,
            answer: mistakeResult.data.metadata?.pairedWith
          })
        }
        
        // 使用批量导出接口
        const exportResult = await window.ipcRenderer.file.exportSelectedMistakes({
          mistakes: mistakesToExport,
          exportType: 'selected'
        })
        
        if (exportResult.success) {
          // 设置所有导出的错题为冻结状态
          for (const result of exportResult.data.exportResults) {
            await window.ipcRenderer.file.setFrozen(result.fileId, true)
            
            // 更新本地状态
            const item = selectedExportItems.value.find(item => item.fileId === result.fileId)
            if (item && item.metadata) {
              item.metadata.isFrozen = true
            }
          }
          
          ElMessage.success(`错题已导出到: ${exportResult.data.exportPath}`)
        } else {
          throw new Error(exportResult.error || '导出失败')
        }
      } catch (error) {
        console.error('导出错题失败:', error)
        ElMessage.warning('部分错题导出失败')
      }
      
      // 导出完成后退出导出模式
      cancelExportMode()
    } else {
      // 原有的全部导出逻辑
      const result = await window.ipcRenderer.file.exportTrainingHistory(
        sortType.value,
        sortOrder.value
      )
      if (result.success) {
        ElMessage.success(`成功导出到: ${result.data.exportDir}`)
      } else {
        throw new Error(result.error)
      }
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

// 考试模式相关方法
const toggleExamMode = () => {
  isExamMode.value = !isExamMode.value
  if (!isExamMode.value) {
    selectedExamItems.value = []
  }
}

const toggleItemSelection = (item: HistoryItem) => {
  const index = selectedExamItems.value.findIndex(i => i.fileId === item.fileId)
  if (index === -1) {
    selectedExamItems.value.push(item)
  } else {
    selectedExamItems.value.splice(index, 1)
  }
}

const isItemSelected = (item: HistoryItem) => {
  return selectedExamItems.value.some(i => i.fileId === item.fileId)
}

const cancelExamMode = () => {
  isExamMode.value = false
  selectedExamItems.value = []
}

// 开始倒计时
const startCountdown = () => {
  if (countdownInterval.value) {
    clearInterval(countdownInterval.value)
  }
  
  isCountdownRunning.value = true
  countdownInterval.value = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--
    } else {
      // 时间到，显示选择弹窗
      ElMessageBox.confirm(
        '时间到！你要继续做还是直接查看答案？',
        '提示',
        {
          confirmButtonText: '继续做',
          cancelButtonText: '直接看答案',
          type: 'warning',
        }
      )
        .then(() => {
          // 用户选择继续做
          // 继续计时，不显示答案
          startTimer()
        })
        .catch(() => {
          // 用户选择直接看答案
          showAnswer.value = true
          showAnswerButtons.value = true
        })
      stopCountdown()
    }
  }, 1000)
}

// 停止倒计时
const stopCountdown = () => {
  if (countdownInterval.value) {
    clearInterval(countdownInterval.value)
    countdownInterval.value = null
  }
  isCountdownRunning.value = false
}

// 格式化倒计时显示
const formattedCountdown = computed(() => {
  const minutes = Math.floor(countdown.value / 60)
  const seconds = countdown.value % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

// 初始化编辑数据
const initEditingMetadata = (item: HistoryItem) => {
  editingMetadata.value = {
    answerTimeLimit: item.metadata?.answerTimeLimit || 300,
    subject: item.metadata?.subject || '',
    tags: [...(item.metadata?.tags || [])]
  }
}

// 保存元数据
const handleSaveMetadata = async () => {
  if (!selectedItem.value) return
  
  try {
    const result = await window.ipcRenderer.metadata.updateDetails(
      selectedItem.value.fileId,
      editingMetadata.value.answerTimeLimit
    )
    
    if (result.success) {
      if (selectedItem.value.metadata) {
        selectedItem.value.metadata.answerTimeLimit = editingMetadata.value.answerTimeLimit
      }
      ElMessage.success('更新成功')
      isEditing.value = false
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error('更新失败')
  }
}

// 获取所有已存在的标签
onMounted(async () => {
  try {
    const result = await window.ipcRenderer.metadata.getAllTags()
    if (result.success) {
      existingTags.value = result.data
    }
  } catch (error) {
    console.error('获取标签失败:', error)
  }
})

// 开始考试
const startExam = () => {
  if (selectedExamItems.value.length === 0) return
  
  isInExam.value = true
  currentExamIndex.value = 0
  
  // 打开第一道题的详情
  handleViewDetail(selectedExamItems.value[0])
}

// 添加退出考试函数
const exitExam = () => {
  isInExam.value = false
  currentExamIndex.value = 0
  handleCloseDialog() // 关闭当前对话框
  isTraining.value = false
}

// 添加导出模式切换函数
const toggleExportMode = () => {
  isExportMode.value = !isExportMode.value
  if (!isExportMode.value) {
    selectedExportItems.value = []
  }
}

// 修改 toggleExportItemSelection 函数
const toggleExportItemSelection = (item: HistoryItem) => {
  // 如果已冻结,则不允许选择
  if (item.metadata?.isFrozen) {
    ElMessage.warning('该项目已被冻结,无法再次导出')
    return
  }

  const index = selectedExportItems.value.findIndex(i => i.fileId === item.fileId)
  if (index === -1) {
    selectedExportItems.value.push(item)
  } else {
    selectedExportItems.value.splice(index, 1)
  }
}

// 判断项目是否被选中
const isExportItemSelected = (item: HistoryItem) => {
  return selectedExportItems.value.some(i => i.fileId === item.fileId)
}

// 取消导出模式
const cancelExportMode = () => {
  isExportMode.value = false
  selectedExportItems.value = []
}

// 添加切换注意力模式的方法
const toggleAttentionMode = () => {
  isAttentionMode.value = !isAttentionMode.value
  ElMessage.success(isAttentionMode.value ? '已开启注意力模式' : '已关闭注意力模式')
}

// 添加右键菜单相关的状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuItem = ref<HistoryItem | null>(null)

// 添加右键菜单处理函数
const handleContextMenu = (e: MouseEvent, item: HistoryItem) => {
  e.preventDefault()
  contextMenuVisible.value = true
  contextMenuPosition.value = { x: e.clientX, y: e.clientY }
  contextMenuItem.value = item
  metadataDialogVisible.value = true
}

// 添加关闭右键菜单函数
const closeContextMenu = () => {
  contextMenuVisible.value = false
  contextMenuItem.value = null
  metadataDialogVisible.value = false
}

// 在 onMounted 中添加事件监听
onMounted(() => {
  document.addEventListener('click', closeContextMenu)
})

// 在 onUnmounted 中移除事件监听
onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
})

// 添加冻结状态切换相关的状态
const isTogglingFreeze = ref(false)

// 添加冻结/解冻处理函数
const handleFreezeToggle = async (item: HistoryItem) => {
  if (!item?.fileId || isTogglingFreeze.value) return
  
  try {
    isTogglingFreeze.value = true
    const newFrozenState = !item.metadata?.isFrozen
    
    const result = await window.ipcRenderer.file.setFrozen(
      item.fileId,
      newFrozenState
    )
    
    if (result.success) {
      // 更新本地状态
      if (item.metadata) {
        item.metadata.isFrozen = newFrozenState
      }
      
      ElMessage.success(newFrozenState ? '错题已冻结' : '错题已解冻')
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('切换冻结状态失败:', error)
    ElMessage.error('操作失败')
  } finally {
    isTogglingFreeze.value = false
  }
}

// 修改舒尔特方格完成的处理函数
const handleSchulteComplete = (time: number) => {
  const timeInSeconds = time / 1000
  
  if (timeInSeconds > schulteTimeLimit.value) {
    ElMessage.warning(`用时 ${timeInSeconds.toFixed(1)} 秒，超过了 ${schulteTimeLimit.value} 秒的限制，需要重新训练！`)
    // 短暂延迟后重新显示舒尔特方格
    setTimeout(() => {
      showSchulteGrid.value = true
    }, 1500)
    return
  }
  
  // 合格后才显示实际题目
  showSchulteGrid.value = false
  ElMessage.success(`舒尔特方格完成！用时：${timeInSeconds.toFixed(1)}秒，成绩合格！`)
  
  // 显示实际的题目详情并开始计时
  if (activeItem.value) {
    showActualDetail(activeItem.value)
    isTraining.value = true
  }
}

defineComponent({
  name: 'History'
})
</script>

<template>
  <div class="mistake-container">
    <!-- 修改顶部导航栏 -->
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

        <div class="attention-mode-controls">
          <el-button
            :type="isAttentionMode ? 'success' : 'default'"
            @click="toggleAttentionMode"
            class="attention-mode-btn"
          >
            <template #icon>
              <el-icon><Bell /></el-icon>
            </template>
            注意力模式{{ isAttentionMode ? '已开启' : '' }}
          </el-button>
          
          <el-input-number 
            v-model="schulteTimeLimit"
            :min="1"
            :max="18"
            :step="1"
            size="small"
            class="time-limit-input"
          >
            <template #prefix>
              合格时间：
            </template>
            <template #suffix>
              秒
            </template>
          </el-input-number>
        </div>
      </div>
      
      <div class="header-actions">
        <div class="export-mode-controls">
          <el-button 
            type="primary" 
            @click="toggleExportMode"
            :class="{ 'is-active': isExportMode }"
          >
            {{ isExportMode ? '退出导出模式' : '选择导出' }}
          </el-button>
          
          <template v-if="isExportMode">
            <div class="export-info">
              已选择: {{ selectedExportItems.length }} 题
            </div>
            <el-button 
              type="success" 
              :disabled="selectedExportItems.length === 0"
              @click="exportHistory"
              :loading="loading"
            >
              导出选中
            </el-button>
            <el-button 
              type="info" 
              @click="cancelExportMode"
            >
              取消
            </el-button>
          </template>
          
          <el-button 
            v-else
            type="primary" 
            @click="exportHistory" 
            :loading="loading"
          >
            导出全部
          </el-button>
        </div>
        
        <div class="exam-mode-controls">
          <el-button 
            type="primary" 
            @click="toggleExamMode"
            :class="{ 'is-active': isExamMode }"
          >
            {{ isExamMode ? '退出考试模式' : '进入考试模式' }}
          </el-button>
          
          <template v-if="isExamMode">
            <div class="exam-info">
              已选择: {{ selectedExamItems.length }} 题
              <span class="exam-time">总时间: {{ Math.floor(totalExamTime / 60) }}分{{ totalExamTime % 60 }}秒</span>
            </div>
            <el-button 
              type="success" 
              :disabled="selectedExamItems.length === 0"
              @click="startExam"
            >
              开始考试
            </el-button>
            <el-button 
              type="info" 
              @click="exitExam"
            >
              取消
            </el-button>
          </template>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && sortedHistoryList.length === 0" description="暂无错题" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="preview-area">
          <div v-for="item in sortedHistoryList" 
               :key="item.fileId" 
               class="preview-item"
               @contextmenu="(e) => handleContextMenu(e, item)"
               :class="{
                 'is-mistake': item.metadata?.type === 'mistake' && !item.metadata?.isPaired,
                 'is-answer': item.metadata?.type === 'answer' && !item.metadata?.isPaired,
                 'is-paired': item.metadata?.isPaired,
                 'is-selectable': (isExamMode || isExportMode) && !item.metadata?.isFrozen,
                 'is-selected': (isExamMode && isItemSelected(item)) || (isExportMode && isExportItemSelected(item)),
                 'is-frozen': item.metadata?.isFrozen
               }"
               @click="isExamMode ? toggleItemSelection(item) : isExportMode ? toggleExportItemSelection(item) : handleViewDetail(item)"
          >
            <el-image 
              :src="item.preview" 
              :preview-src-list="[]"
              fit="contain"
              class="preview-image"
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
        <div class="countdown-display" v-if="isCountdownRunning">
          剩余时间：{{ formattedCountdown }}
        </div>
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
        <!-- 修改按钮的显示条件 -->
        <el-button 
          v-if="showAnswerButtons"
          class="side-button left-button"
          type="success" 
          size="large"
          round
          :disabled="activeItem && formatTrainingStatus(activeItem.metadata.nextTrainingDate).status === 'pending'"
          @click="activeItem && handleTrainingResult(true)"
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

        <!-- 修改按钮的显示条件 -->
        <el-button 
          v-if="showAnswerButtons"
          class="side-button right-button"
          type="danger" 
          size="large"
          round
          :disabled="activeItem && formatTrainingStatus(activeItem.metadata.nextTrainingDate).status === 'pending'"
          @click="activeItem && handleTrainingResult(false)"
        >
          没记住
        </el-button>
      </div>
      
      <div class="answer-control">
        <el-button 
          type="primary" 
          @click="toggleAnswer"
          :icon="showAnswer ? 'Hide' : 'View'"
          :disabled="showAnswer"
        >
          <template v-if="activeItem.metadata?.isPaired">
            {{ showAnswer ? '已完成' : '完成并显示答案' }}
          </template>
          <template v-else>
            {{ showAnswer ? '已完成' : '完成' }}
          </template>
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

  <!-- 添加元数据弹窗 -->
  <el-dialog
    v-model="metadataDialogVisible"
    title="错题详情"
    width="500px"
  >
    <div v-if="contextMenuItem" class="metadata-content">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="熟练度">
          {{ contextMenuItem.metadata?.proficiency || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="训练间隔">
          {{ contextMenuItem.metadata?.trainingInterval || 0 }} 天
        </el-descriptions-item>
        <el-descriptions-item label="上次训练">
          {{ formatDate(contextMenuItem.metadata?.lastTrainingDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="下次训练">
          {{ formatDate(contextMenuItem.metadata?.nextTrainingDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="冻结状态">
          <div class="freeze-status">
            <span>{{ contextMenuItem.metadata?.isFrozen ? '已冻结' : '未冻结' }}</span>
            <el-button
              :type="contextMenuItem.metadata?.isFrozen ? 'success' : 'warning'"
              size="small"
              @click="handleFreezeToggle(contextMenuItem)"
              :loading="isTogglingFreeze"
            >
              {{ contextMenuItem.metadata?.isFrozen ? '解冻' : '冻结' }}
            </el-button>
          </div>
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </el-dialog>

  <!-- 添加舒尔特方格弹窗 -->
  <el-dialog
    v-model="showSchulteGrid"
    title="注意力训练 - 舒尔特方格"
    width="80%"
    :close-on-click-modal="false"
    :show-close="false"
    destroy-on-close
  >
    <schulte-grid
      :grid-size="schulteGridSize"
      :time-limit="schulteTimeLimit"
      @complete="handleSchulteComplete"
    />
  </el-dialog>

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
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  width: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.preview-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
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
  20% {
    transform: rotate(5deg);
  }
  40% {
    transform: rotate(-5deg);
  }
  60% {
    transform: rotate(3deg);
  }
  80% {
    transform: rotate(-3deg);
  }
}

/* 修改颜色过渡动画为更柔和的效果 */
@keyframes colorPulse {
  0% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 0 rgba(0, 0, 0, 0.1);
  }
  50% {
    opacity: 0.95;
    transform: scale(1.01);
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.15);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 0 rgba(0, 0, 0, 0.1);
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
  width: 120px;  /* 增加宽度 */
  height: 120px;  /* 增加高度，与宽度相同形成正方形 */
  border-radius: 45px;  /* 调整圆角 */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;  /* 增加字体大小 */
  padding: 0;  /* 移除内边距 */
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.side-button:hover {
  transform: translateY(-50%) scale(1.05);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.left-button {
  left: -90px;
}

.right-button {
  right: -90px;
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
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.nav-button.is-disabled {
  background-color: rgba(255, 255, 255, 0.5);
}

.metadata-content {
  padding: 20px;
}
.mx-1 {
  margin: 0 4px;
}

.exam-mode-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.exam-info {
  background-color: var(--el-color-info-light-9);
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  display: flex;
  gap: 16px;
}

.exam-time {
  color: var(--el-color-primary);
  font-weight: 600;
}

.preview-item.is-selectable {
  cursor: pointer;
  transition: all 0.3s ease;
}

.preview-item.is-selected {
  border: 2px solid var(--el-color-primary);
  transform: scale(1.02);
  box-shadow: 0 0 10px rgba(var(--el-color-primary-rgb), 0.3);
}

.preview-item.is-selected:hover {
  transform: scale(1.03) translateY(-5px);
}

.countdown-display {
  display: flex;
  align-items: center;
  font-size: 24px;
  color: var(--el-color-danger);
  margin-right: 20px;
  font-weight: bold;
}

.timer-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

.dialog-header {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.edit-form {
  padding: 20px;
}

.export-mode-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.export-info {
  background-color: var(--el-color-info-light-9);
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 20px;
  align-items: center;
}

/* 修改冻结状态的样式,添加禁用效果 */
.preview-item.is-frozen {
  border: 2px solid var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  position: relative;
  opacity: 0.7;
  cursor: not-allowed;
}

.preview-item.is-frozen::after {
  content: '已冻结';
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: var(--el-color-primary);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.attention-mode-btn {
  margin-left: 16px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.attention-mode-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
}

.attention-mode-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-limit-input {
  width: 180px;
}

.time-limit-input :deep(.el-input-number__prefix),
.time-limit-input :deep(.el-input-number__suffix) {
  color: var(--el-text-color-regular);
}

.training-tip.submitting {
  color: var(--el-color-primary);
  font-weight: 500;
}

/* 添加训练控制按钮的样式 */
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
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.training-control .el-button:not(.is-disabled):active {
  transform: translateY(1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.training-control .el-button + .el-button {
  margin-left: 16px;
}

/* 添加按钮禁用时的样式 */
.el-button.is-disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
</style> 