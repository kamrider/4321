<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted, defineComponent } from 'vue'
import type { MistakeItem, TrainingRecord } from '../../electron/preload'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { ElDropdown } from 'element-plus'
import * as echarts from 'echarts'

const mistakeList = ref<MistakeItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// 添加新的状态
const dialogVisible = ref(false)
const activeItem = ref<MistakeItem | null>(null)
const showAnswer = ref(false)

// 添加排序相关的状态
const sortType = ref<'time' | 'proficiency'>('time')
const sortOrder = ref<'asc' | 'desc'>('desc')

// 添加排序后的列表计算属性
const sortedMistakeList = computed(() => {
  if (!mistakeList.value) return []
  
  return [...mistakeList.value].sort((a, b) => {
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

// 添加查看详情处理函数
const handleViewDetail = (item: MistakeItem) => {
  activeItem.value = item
  dialogVisible.value = true
}

// 添加关闭弹窗处理函数
const handleCloseDialog = () => {
  dialogVisible.value = false
  activeItem.value = null
  showAnswer.value = false
}

// 添加切换答案显示的函数
const toggleAnswer = () => {
  showAnswer.value = !showAnswer.value
  console.log('切换答案显示:', showAnswer.value)
}

// 添加右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuItem = ref<MistakeItem | null>(null)

// 添加统计相关的计算属性
const statistics = computed(() => {
  if (!mistakeList.value) return {
    total: 0,
    needTraining: 0,
    overdue: 0,
    todayTraining: 0,
    averageProficiency: 0
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const stats = {
    total: mistakeList.value.length,
    needTraining: 0,
    overdue: 0,
    todayTraining: 0,
    averageProficiency: 0
  }

  let totalProficiency = 0

  mistakeList.value.forEach(item => {
    if (item.metadata?.nextTrainingDate) {
      const trainingDate = new Date(item.metadata.nextTrainingDate)
      trainingDate.setHours(0, 0, 0, 0)
      
      if (trainingDate.getTime() === today.getTime()) {
        stats.todayTraining++
      } else if (trainingDate.getTime() < today.getTime()) {
        stats.overdue++
      }
    }

    if (item.metadata?.proficiency !== undefined) {
      totalProficiency += item.metadata.proficiency
    }
  })

  stats.needTraining = stats.todayTraining + stats.overdue
  stats.averageProficiency = Math.round(totalProficiency / stats.total) || 0

  return stats
})

// 修改计算熟练度分布的函数
const proficiencyDistribution = computed(() => {
  const distribution = {
    '熟练度0': 0,
    '熟练度10': 0,
    '熟练度20': 0,
    '熟练度30': 0,
    '熟练度40': 0,
    '熟练度50以上': 0
  }

  mistakeList.value.forEach(item => {
    const proficiency = item.metadata?.proficiency || 0
    if (proficiency === 0) distribution['熟练度0']++
    else if (proficiency === 10) distribution['熟练度10']++
    else if (proficiency === 20) distribution['熟练度20']++
    else if (proficiency === 30) distribution['熟练度30']++
    else if (proficiency === 40) distribution['熟练度40']++
    else if (proficiency >= 50) distribution['熟练度50以上']++
  })

  return distribution
})

// 修改初始化雷达图的函数
const initRadarChart = () => {
  if (!radarChartRef.value) return
  
  if (radarChart) {
    radarChart.dispose()
  }

  radarChart = echarts.init(radarChartRef.value)
  
  const distribution = proficiencyDistribution.value
  
  const option = {
    title: {
      text: '错题熟练度分布',
      left: 'center',
      top: 20,
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `${params.name}: ${params.value}题`
      }
    },
    radar: {
      shape: 'circle',
      indicator: Object.keys(distribution).map(name => ({
        name,
        max: Math.max(...Object.values(distribution)) + 2
      })),
      radius: '60%',
      splitNumber: 4,
      axisName: {
        color: '#666',
        fontSize: 12
      },
      splitArea: {
        areaStyle: {
          color: ['#f5f7fa', '#e4e7ed', '#ebeef5', '#f2f6fc']
        }
      }
    },
    series: [{
      type: 'radar',
      data: [{
        value: Object.values(distribution),
        name: '题目数量',
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(103,194,58,0.6)' },  // 使用 Element Plus 的成功色
            { offset: 1, color: 'rgba(103,194,58,0.2)' }
          ])
        },
        lineStyle: {
          color: '#67c23a',
          width: 2
        },
        itemStyle: {
          color: '#67c23a'
        },
        emphasis: {
          itemStyle: {
            color: '#67c23a',
            shadowBlur: 10,
            shadowColor: 'rgba(103,194,58,0.5)'
          }
        }
      }]
    }]
  }
  
  radarChart.setOption(option)
}

// 修改获取数据的过滤逻辑
onMounted(async () => {
  try {
    const result = await window.ipcRenderer.mistake.getMistakes()
    if (result.success && result.data) {
      // 过滤掉没有元数据的项目
      mistakeList.value = result.data.filter(item => {
        // 必须有metadata
        if (!item.metadata) return false
        
        // 如果是配对项，只显示错题
        if (item.metadata.isPaired) {
          return item.metadata.type === 'mistake'
        }
        
        // 未配对项，显示所有有类型的项目
        return item.metadata.type === 'mistake' || item.metadata.type === 'answer'
      })
    }
  } catch (err) {
    console.error('加载失败:', err)
    error.value = '加载失败'
  } finally {
    loading.value = false
  }
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

// 添加导出函数
const exportImages = async () => {
  try {
    loading.value = true
    // 获取所有错题的路径
    const imagePaths = mistakeList.value
      .filter(item => item.metadata?.type === 'mistake')
      .map(item => item.path)
    
    if (imagePaths.length === 0) {
      ElMessage.warning('没有可导出的错题')
      return
    }

    // 通过 preload 定义的接口调用
    const result = await window.ipcRenderer.file.export(imagePaths)
    if (result.success) {
      ElMessage.success(`导出成功，文件保存在: ${result.exportPath}`)
    } else {
      ElMessage.error(result.error || '导出失败')
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  } finally {
    loading.value = false
  }
}

// 添加删除处理函数
const handleDelete = async (item: MistakeItem) => {
  try {
    // 显示确认对话框
    await ElMessageBox.confirm(
      item.metadata?.isPaired 
        ? '此操作将删除错题及其对应的答案，是否继续？'
        : '确定要删除这个错题吗？',
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    loading.value = true

    // 如果是配对的错题，需要同时删除答案
    if (item.metadata?.isPaired && item.metadata?.pairId) {
      // 找到所有配对的答案
      const pairedAnswers = mistakeList.value.filter(
        m => m.metadata?.pairId === item.metadata?.pairId && m.fileId !== item.fileId
      )

      // 删除所有配对的答案
      for (const answer of pairedAnswers) {
        await window.ipcRenderer.file.delete(answer.fileId)
      }
    }

    // 删除错题本身
    const result = await window.ipcRenderer.file.delete(item.fileId)
    if (result.success) {
      // 从列表中移除
      mistakeList.value = mistakeList.value.filter(i => i.fileId !== item.fileId)
      ElMessage.success('删除成功')
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    if (error === 'cancel') return
    console.error('删除失败:', error)
    ElMessage.error('删除失败')
  } finally {
    loading.value = false
  }
}

// 添加加入训练的方法
const handleAddToTraining = async (item: MistakeItem) => {
  try {
    // 设置今天0点作为训练日期
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const result = await window.ipcRenderer.metadata.setNextTrainingDate(
      item.fileId,
      today.toISOString()
    )
    
    if (result.success) {
      // 更新本地状态
      if (!item.metadata) {
        item.metadata = {
          proficiency: 0,
          trainingInterval: 0,
          lastTrainingDate: '',
          nextTrainingDate: '',
          subject: '',
          tags: [],
          notes: '',
          trainingRecords: [],
          answerTimeLimit: 300,
          type: 'mistake'
        }
      }
      
      item.metadata.nextTrainingDate = today.toISOString()
      ElMessage.success('已加入今天的训练')
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('加入训练失败:', error)
    ElMessage.error('加入训练失败')
  }
}

// 添加右键菜单处理函数
const handleContextMenu = (e: MouseEvent, item: MistakeItem) => {
  e.preventDefault()
  contextMenuVisible.value = true
  contextMenuPosition.value = { x: e.clientX, y: e.clientY }
  contextMenuItem.value = item
}

// 添加关闭右键菜单函数
const closeContextMenu = () => {
  contextMenuVisible.value = false
  contextMenuItem.value = null
}

// 添加点击外部关闭右键菜单
onMounted(() => {
  document.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeContextMenu)
})

// 添加雷达图相关的状态
const showRadarChart = ref(false)
const radarChartRef = ref<HTMLElement | null>(null)
let radarChart: echarts.ECharts | null = null

// 添加显示/隐藏雷达图的处理函数
const toggleRadarChart = () => {
  showRadarChart.value = !showRadarChart.value
  if (showRadarChart.value) {
    // 在下一个 tick 初始化图表，确保 DOM 已更新
    setTimeout(() => {
      initRadarChart()
    }, 0)
  }
}

// 添加窗口大小变化的处理
const handleResize = () => {
  if (radarChart && showRadarChart.value) {
    radarChart.resize()
  }
}

// 在组件卸载时清理
onUnmounted(() => {
  if (radarChart) {
    radarChart.dispose()
  }
  window.removeEventListener('resize', handleResize)
})

// 在组件挂载时添加窗口大小变化监听
onMounted(() => {
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', closeContextMenu)
})

defineComponent({
  name: 'Mistake'
})
</script>

<template>
  <div class="mistake-container">
    <!-- 修改统计信息展示，添加点击事件 -->
    <div class="statistics-bar" @click="toggleRadarChart">
      <div class="stat-item">
        <div class="stat-value">{{ statistics.total }}</div>
        <div class="stat-label">总错题数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ statistics.needTraining }}</div>
        <div class="stat-label">待训练</div>
      </div>
      <div class="stat-item warning">
        <div class="stat-value">{{ statistics.overdue }}</div>
        <div class="stat-label">已逾期</div>
      </div>
      <div class="stat-item primary">
        <div class="stat-value">{{ statistics.todayTraining }}</div>
        <div class="stat-label">今日训练</div>
      </div>
      <div class="stat-item success">
        <div class="stat-value">{{ statistics.averageProficiency }}%</div>
        <div class="stat-label">平均熟练度</div>
      </div>
    </div>

    <!-- 添加雷达图对话框 -->
    <el-dialog
      v-model="showRadarChart"
      title="错题熟练度分布"
      width="80%"
      :destroy-on-close="true"
      class="radar-chart-dialog"
    >
      <div ref="radarChartRef" class="radar-chart"></div>
    </el-dialog>

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
        <el-button type="primary" @click="exportImages" :loading="loading">
          导出错题
        </el-button>
      </div>
    </div>

    <el-empty v-if="!loading && sortedMistakeList.length === 0" description="暂无错题" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="preview-area">
          <transition-group name="mistake-list">
            <div v-for="item in sortedMistakeList" 
                :key="item.fileId" 
                class="preview-item"
                :class="{
                  'is-mistake': item.metadata?.type === 'mistake' && !item.metadata?.isPaired,
                  'is-answer': item.metadata?.type === 'answer' && !item.metadata?.isPaired,
                  'is-paired': item.metadata?.isPaired
                }"
                @click="item.metadata?.isPaired ? handleViewDetail(item) : null"
                @contextmenu="(e) => handleContextMenu(e, item)">
              <el-button
                class="delete-btn"
                type="danger"
                circle
                size="small"
                @click.stop="handleDelete(item)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
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
              </div>
            </div>
          </transition-group>
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
      <div class="mistake-section">
        <el-image 
          :src="activeItem.preview"
          :preview-src-list="[activeItem.preview]"
          fit="contain"
          class="detail-image"
        />
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
      
      <transition name="fade">
        <div class="answer-section" v-if="showAnswer && activeItem.metadata?.pairedWith">
          <!-- 如果 pairedWith 是数组，遍历显示所有答案 -->
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
          
          <!-- 如果 pairedWith 是单个对象，保持原有显示方式 -->
          <template v-else>
            <el-image 
              :src="activeItem.metadata.pairedWith.preview"
              :preview-src-list="[activeItem.metadata.pairedWith.preview]"
              fit="contain"
              class="detail-image"
            />
          </template>
        </div>
      </transition>
    </div>
  </el-dialog>

  <!-- 添加右键菜单 -->
  <transition name="context-menu-fade">
    <div v-if="contextMenuVisible" 
        class="context-menu"
        :style="{ 
          left: contextMenuPosition.x + 'px', 
          top: contextMenuPosition.y + 'px'
        }">
      <div class="context-menu-item"
          :class="{ disabled: formatTrainingStatus(contextMenuItem?.metadata?.nextTrainingDate).status === 'today' }"
          @click="contextMenuItem && handleAddToTraining(contextMenuItem)">
        加入今天训练
      </div>
      <div class="context-menu-item danger"
          @click="contextMenuItem && handleDelete(contextMenuItem)">
        删除
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* 保留原有样式 */
.mistake-container {
  padding: 20px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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
  transition: all 0.3s ease;
  transform: translateY(0);
}

.preview-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
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

/* 添加新的样式，参考 PairMistake.vue 的样式 */
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
  cursor: pointer;
}

.preview-item.is-paired .preview-image {
  cursor: pointer;
}

.preview-item:not(.is-paired) .preview-image {
  cursor: zoom-in;
}

/* 添加详情弹窗相关样式 */
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
  justify-content: center;
  position: relative;
  padding: 20px;
}

.mistake-section,
.answer-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.detail-image {
  height: calc(90vh - 80px);
  width: auto;
  object-fit: scale-down;
  background-color: #f5f7fa;
}

.answer-item {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.answer-item .detail-image {
  height: calc(90vh - 80px);
  width: auto;
  object-fit: scale-down;
  background-color: #f5f7fa;
}

.answer-control {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 16px;
  display: flex;
  justify-content: center;
  z-index: 2001; /* 确保在弹窗之上 */
}

.answer-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.answer-item {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.answer-item .detail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: #f5f7fa;
}

.answer-title {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 10px;
  background: rgba(255, 255, 255, 0.9);
  margin: 0;
  font-size: 16px;
  color: #606266;
  z-index: 1;
  text-align: center;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 0 20px;
}

.header h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  opacity: 0;
  transition: all 0.3s ease;
}

.delete-btn:hover {
  transform: rotate(90deg);
  background-color: var(--el-color-danger-dark-2) !important;
}

.preview-item:hover .delete-btn {
  opacity: 1;
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
  transition: all 0.3s ease;
}

.sort-controls .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.sort-controls .el-icon {
  margin-left: 4px;
}

/* 为所有按钮添加悬停动画 */
:deep(.el-button) {
  transition: all 0.3s ease;
}

:deep(.el-button:not(.is-disabled):hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

:deep(.el-button.is-text:hover) {
  transform: translateY(-1px);
  box-shadow: none;
  background-color: var(--el-fill-color-light);
}

:deep(.el-button.is-link:hover) {
  transform: translateY(-1px);
  text-decoration: underline;
  box-shadow: none;
}

/* 特殊按钮样式 */
.header-actions :deep(.el-button) {
  transition: all 0.3s ease;
}

.header-actions :deep(.el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.answer-control :deep(.el-button) {
  transition: all 0.3s ease;
  position: relative;
}

.answer-control :deep(.el-button:hover) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.answer-control :deep(.el-button:active) {
  transform: translateY(1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 5px 0;
  min-width: 150px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,.1);
  z-index: 3000;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  color: #606266;
  font-size: 14px;
  line-height: 1.5;
  transition: all 0.2s ease;
}

.context-menu-item:hover {
  background-color: #f5f7fa;
  transform: translateX(3px);
}

.context-menu-item.disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}

.context-menu-item.disabled:hover {
  background-color: transparent;
  transform: none;
}

.context-menu-item.danger {
  color: #f56c6c;
  border-top: 1px solid #ebeef5;
  margin-top: 5px;
  padding-top: 8px;
}

.context-menu-item.danger:hover {
  background-color: #fef0f0;
}

/* 添加动画相关样式 */
.mistake-list-enter-active,
.mistake-list-leave-active {
  transition: all 0.5s ease;
}

.mistake-list-enter-from {
  opacity: 0;
  transform: translateY(30px);
}

.mistake-list-leave-to {
  opacity: 0;
  transform: translateY(-30px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.context-menu-fade-enter-active,
.context-menu-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.context-menu-fade-enter-from,
.context-menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* 添加统计栏样式 */
.statistics-bar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: var(--el-box-shadow-lighter);
}

.stat-item {
  text-align: center;
  padding: 0 20px;
  position: relative;
}

.stat-item:not(:last-child)::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 70%;
  width: 1px;
  background-color: var(--el-border-color-lighter);
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.stat-item.warning .stat-value {
  color: var(--el-color-warning);
}

.stat-item.primary .stat-value {
  color: var(--el-color-primary);
}

.stat-item.success .stat-value {
  color: var(--el-color-success);
}

/* 为统计数字添加动画效果 */
@keyframes countUp {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.stat-value {
  animation: countUp 0.5s ease-out;
}

/* 添加雷达图相关样式 */
.radar-chart {
  width: 100%;
  height: 500px;
}

.radar-chart-dialog :deep(.el-dialog__body) {
  padding: 20px;
}
</style> 