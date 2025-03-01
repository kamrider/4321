<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { MistakeItem } from '../../electron/preload'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const uploadedFileIds = ref<string[]>([])
const mistakeList = ref<MistakeItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const draggedItem = ref<MistakeItem | null>(null)
const dragOverItem = ref<MistakeItem | null>(null)
const dialogVisible = ref(false)
const activeItem = ref<MistakeItem | null>(null)
const showAnswer = ref(false)

onMounted(async () => {
  try {
    const uploadedFilesStr = localStorage.getItem('recentlyUploadedFiles')
    const uploadedFiles = uploadedFilesStr ? JSON.parse(uploadedFilesStr) : []
    console.log('获取到的上传文件:', uploadedFiles)
    
    const result = await window.ipcRenderer.mistake.getMistakes()
    if (result.success && result.data) {
      // 使用 fileId 匹配文件
      mistakeList.value = result.data.filter(item => {
        const matches = uploadedFiles.some(f => f.fileId === item.fileId)
        return matches && !item.metadata?.isPaired
      })
      
      // 使用 uploadIndex 排序
      mistakeList.value.sort((a, b) => {
        const aIndex = uploadedFiles.find(f => f.fileId === a.fileId)?.uploadIndex ?? 0
        const bIndex = uploadedFiles.find(f => f.fileId === b.fileId)?.uploadIndex ?? 0
        return aIndex - bIndex
      })
      
      console.log('过滤并排序后的文件列表:', mistakeList.value)
      
      if (mistakeList.value.length > 0) {
        // 将偶数位置的文件设置为答案类型（保持错题-答案交替顺序）
        for (let i = 1; i < mistakeList.value.length; i += 2) {
          const item = mistakeList.value[i]
          try {
            await window.ipcRenderer.metadata.updateType(item.fileId, 'answer')
            item.metadata.type = 'answer'
          } catch (err) {
            console.error('设置类型失败:', err)
          }
        }
      } else {
        console.warn('没有找到匹配的文件')
      }
    }
  } catch (err) {
    console.error('加载图片失败:', err)
    error.value = '加载图片失败'
  } finally {
    loading.value = false
  }
})

const handleDragStart = (item: MistakeItem, event: DragEvent) => {
  draggedItem.value = item
  
  // 如果是已配对的项目，创建一个虚拟的分离预览
  if (item.metadata.isPaired && item.metadata.pairedWith) {
    const separatedItem = item.metadata.pairedWith
    const previewElement = document.createElement('div')
    previewElement.className = 'preview-item is-separating'
    previewElement.style.opacity = '0.6'
    previewElement.style.border = '2px dashed #E6A23C'
    document.body.appendChild(previewElement)
    
    // 清理函数
    const cleanup = () => {
      document.body.removeChild(previewElement)
      window.removeEventListener('dragend', cleanup)
    }
    window.addEventListener('dragend', cleanup)
  }
  
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const handleDragOver = (item: MistakeItem, event: DragEvent) => {
  event.preventDefault()
  if (!draggedItem.value || draggedItem.value === item) return
  
  dragOverItem.value = item
  
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

const handleDragEnd = () => {
  if (!draggedItem.value) {
    draggedItem.value = null
    dragOverItem.value = null
    return
  }

  const sourceItem = draggedItem.value
  const targetItem = dragOverItem.value

  if (sourceItem.metadata.isPaired) {
    // 果是已配对项目，执行分离操作
    if (!targetItem) {
      // 拖到空白处，执行分离
      unpairItems(sourceItem)
    } else if (targetItem.metadata.isPaired) {
      // 拖到另一个配对项，交换置
      const sourceIndex = mistakeList.value.indexOf(sourceItem)
      const targetIndex = mistakeList.value.indexOf(targetItem)
      mistakeList.value.splice(sourceIndex, 1)
      mistakeList.value.splice(targetIndex, 0, sourceItem)
    }
  } else if (targetItem && sourceItem.metadata.type !== targetItem.metadata.type) {
    // 未配对项目，尝试配对
    pairItems(sourceItem, targetItem)
  } else if (targetItem) {
    // 相同类型，交换位置
    const sourceIndex = mistakeList.value.indexOf(sourceItem)
    const targetIndex = mistakeList.value.indexOf(targetItem)
    mistakeList.value.splice(sourceIndex, 1)
    mistakeList.value.splice(targetIndex, 0, sourceItem)
  }

  draggedItem.value = null
  dragOverItem.value = null
}

const pairItems = async (item1: MistakeItem, item2: MistakeItem) => {
  try {
    // 确保错题在前，答案在后
    const [mistakeItem, answerItem] = item1.metadata.type === 'mistake' 
      ? [item1, item2] 
      : [item2, item1]
    
    // 如果是答案项与答案项，或错题项与错题项，不允许配对
    if (mistakeItem.metadata.type === answerItem.metadata.type) {
      ElMessage.warning('相同类型的项目不能配对')
      return
    }
    
    await window.ipcRenderer.metadata.pairImages(mistakeItem.fileId, answerItem.fileId)
    
    // 更新状态
    mistakeItem.metadata.isPaired = true
    mistakeItem.metadata.pairId = `pair_${Date.now()}`
    
    // 如果已经有配对答案，创建数组存储
    if (!Array.isArray(mistakeItem.metadata.pairedWith)) {
      mistakeItem.metadata.pairedWith = []
    }
    mistakeItem.metadata.pairedWith.push(answerItem)
    
    answerItem.metadata.isPaired = true
    answerItem.metadata.pairId = mistakeItem.metadata.pairId
    answerItem.metadata.pairedWith = mistakeItem
    
    // 从列表中移除答案项
    mistakeList.value = mistakeList.value.filter(item => item !== answerItem)
    
    ElMessage.success('配对成功！')
  } catch (error) {
    ElMessage.error('配对失败')
  }
}

const unpairItems = async (item: MistakeItem) => {
  if (!item.metadata.pairedWith) return
  
  try {
    // 获取所有配对项
    const pairedItems = Array.isArray(item.metadata.pairedWith) 
      ? item.metadata.pairedWith 
      : [item.metadata.pairedWith]
    
    // 解绑所有配对项
    for (const pairedItem of pairedItems) {
      await window.ipcRenderer.metadata.unpairImages(item.fileId, pairedItem.fileId)
      
      // 重置配对项状态
      pairedItem.metadata.isPaired = false
      pairedItem.metadata.pairId = null
      pairedItem.metadata.pairedWith = null
      
      // 将答案项添加回列表
      const mistakeIndex = mistakeList.value.indexOf(item)
      mistakeList.value.splice(mistakeIndex + 1, 0, pairedItem)
    }
    
    // 重置当前项状态
    item.metadata.isPaired = false
    item.metadata.pairId = null
    item.metadata.pairedWith = null
    
    ElMessage.success('解绑成功')
  } catch (error) {
    console.error('解绑失败:', error)
    ElMessage.error('解绑失败，请重试')
  }
}

// 切换图片类型
const toggleImageType = async (item: MistakeItem) => {
  const newType = item.metadata.type === 'mistake' ? 'answer' : 'mistake'
  try {
    await window.ipcRenderer.metadata.updateType(item.fileId, newType)
    item.metadata.type = newType
    ElMessage.success(`已设置为${newType === 'mistake' ? '错题' : '答案'}`)
  } catch (error) {
    ElMessage.error('设置失败')
  }
}

// 添加预览处理函数
const handleViewDetail = (item: MistakeItem) => {
  activeItem.value = item
  dialogVisible.value = true
}

// 添加关闭预览处理函数
const handleCloseDialog = () => {
  dialogVisible.value = false
  activeItem.value = null
  showAnswer.value = false
}

// 添加切换答案显示的函数
const toggleAnswer = () => {
  showAnswer.value = !showAnswer.value
}

// 添加确认处理函数
const handleConfirm = () => {
  router.push('/mistake')
}
</script>

<template>
  <div class="pair-mistake-container">
    <div class="confirm-area">
      <el-button 
        type="primary" 
        size="large"
        :disabled="false"
        @click="handleConfirm"
      >
        完成配对并继续
      </el-button>
    </div>
    
    <el-empty v-if="!loading && mistakeList.length === 0" description="暂无未配对的图片" />
    
    <el-skeleton :loading="loading" animated :count="4" v-else>
      <template #default>
        <div class="preview-area">
          <div v-for="item in mistakeList" 
               :key="item.fileId" 
               class="preview-item"
               :class="{
                 'is-mistake': !item.metadata.isPaired && item.metadata.type === 'mistake',
                 'is-answer': !item.metadata.isPaired && item.metadata.type === 'answer',
                 'is-dragging': item === draggedItem,
                 'can-pair': !item.metadata.isPaired && draggedItem && 
                            item === dragOverItem && 
                            draggedItem.metadata.type !== item.metadata.type,
                 'no-pair': draggedItem && item === dragOverItem && 
                           draggedItem.metadata.type === item.metadata.type,
                 'is-paired': item.metadata.isPaired
               }"
               :draggable="true"
               @dragstart="handleDragStart(item, $event)"
               @dragover="handleDragOver(item, $event)"
               @dragend="handleDragEnd">
            <el-image 
              :src="item.preview" 
              :preview-src-list="[]"
              fit="contain"
              class="preview-image"
              @click.stop="handleViewDetail(item)"
            />
            <div class="file-info" @click="!item.metadata.isPaired && toggleImageType(item)">
              <p class="file-name">{{ item.originalFileName }}</p>
              <p class="type-indicator" v-if="!item.metadata.isPaired">
                {{ item.metadata.type === 'mistake' ? '错题' : '答案' }}
              </p>
              <p class="type-indicator is-paired" v-else>
                已配对
              </p>
            </div>
          </div>
        </div>
      </template>
    </el-skeleton>
  </div>

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
    </div>
  </el-dialog>
</template>

<style scoped>
.pair-mistake-container {
  padding: 16px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-width: 1400px;
  margin: 0 auto;
}

.preview-area {
  display: grid;
  gap: 12px;
  padding: 12px;
  grid-template-columns: 1fr;
}

.preview-item {
  position: relative;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 8px;
  transition: all 0.3s ease;
  animation: fadeIn 0.5s ease-in-out;
  display: flex;
  flex-direction: column;
  min-height: 320px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pairSuccess {
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(230, 162, 60, 0); }
  50% { transform: scale(1.1); box-shadow: 0 0 20px rgba(230, 162, 60, 0.5); }
  100% { transform: scale(1); box-shadow: 0 0 5px rgba(230, 162, 60, 0.3); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

.preview-item.is-paired {
  animation: pairSuccess 0.6s ease-out;
}

.preview-item.no-pair {
  animation: shake 0.5s ease-in-out;
}

.preview-image {
  width: 100%;
  object-fit: contain;
  border-radius: 4px;
  margin-bottom: 8px;
  height: 200px;
  flex: 1;
}

.preview-image:hover {
  transform: scale(1.03);
}

.file-info {
  margin-top: 8px;
  padding: 4px;
}

.file-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 12px;
}

.preview-item.is-mistake {
  border-color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-7);
}

.preview-item.is-answer {
  border-color: var(--el-color-success);
  background-color: var(--el-color-success-light-7);
}

.type-indicator {
  text-align: center;
  padding: 8px;
  border-radius: 4px;
  font-weight: bold;
  margin-top: 8px;
}

.is-mistake .type-indicator {
  background-color: var(--el-color-danger-light-8);
  color: var(--el-color-danger);
}

.is-answer .type-indicator {
  background-color: var(--el-color-success-light-8);
  color: var(--el-color-success);
}

/* 悬停效果 */
.preview-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 更精确的响应式断点 */
/* 600px是一个项目的最小宽度加上容器padding和项目间距 */
@media screen and (min-width: 600px) {
  .preview-area {
    grid-template-columns: repeat(1, 1fr); /* 设置为1列 */
  }
}

/* 920px是两个项目的最小宽度加上容器padding和项目间距 */
@media screen and (min-width: 920px) {
  .preview-area {
    grid-template-columns: repeat(2, 1fr); /* 设置为2列 */
    grid-template-columns: repeat(3, 1fr); /* 3列 */
  }
}

/* 只在非常宽的屏幕上才考虑4列 */
@media screen and (min-width: 1240px) {
  .preview-area {
    grid-template-columns: repeat(4, 1fr); /* 4列 */
  }
}

.preview-item.is-dragging {
  opacity: 0.5;
  transform: scale(0.95);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

.preview-item.can-pair {
  border-color: var(--el-color-success);
  box-shadow: 0 0 15px var(--el-color-success);
  transform: scale(1.05);
  animation: pulse 1.5s infinite;
}

.preview-item.is-paired {
  border-color: #E6A23C;
  background-color: #fdf6ec;
  cursor: grab;
  opacity: 1;
}

.preview-item.is-paired:active {
  cursor: grabbing;
}

.preview-item.is-paired::after {
  content: '';
  position: absolute;
  top: 5px;
  left: 5px;
  right: -5px;
  bottom: -5px;
  background-color: #faecd8;
  border: 2px solid #E6A23C;
  border-radius: 8px;
  z-index: -1;
}

.preview-item.is-paired.is-mistake {
  margin-bottom: 24px;  /* 使用正常的间距 */
  z-index: 2;
}

.preview-item.is-paired.is-answer {
  z-index: 1;
}

/* 确保所有卡片高度一致 */
.preview-item {
  height: 450px;  /* 设置固定高度 */
  min-height: unset;  /* 除最小高度限制 */
}

.preview-image {
  height: 300px;  /* 设置固定高度 */
  min-height: unset;
  max-height: unset;
}

.preview-item.is-paired {
  border-color: #E6A23C;
  background-color: #fdf6ec;
  cursor: default;
  opacity: 0.8;
}

.type-indicator.is-paired {
  background-color: #faecd8;
  color: #E6A23C;
}

.preview-item.is-separating {
  position: absolute;
  pointer-events: none;
  background-color: #fdf6ec;
  border: 2px dashed #E6A23C !important;
  opacity: 0.6;
  z-index: 1000;
  width: 280px;
  height: 450px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(230, 162, 60, 0.2);
}

.preview-item.is-paired {
  position: relative;
  cursor: grab;
}

.preview-item.is-paired:active {
  cursor: grabbing;
}

.preview-item.is-paired.dragging {
  opacity: 0.8;
  transform: scale(0.95);
}

.preview-item.is-paired.dragging::after {
  border-style: dashed;
}

/* 添加确认按钮区域样式 */
.confirm-area {
  display: flex;
  justify-content: center;
  padding: 20px;
  position: sticky;
  top: 0;
  background: white;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  margin-bottom: 20px;
}

.answer-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
  animation: slideIn 0.4s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.answer-item {
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  padding: 15px;
  background: #f8f9fa;
}

.answer-title {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #606266;
}

.detail-image {
  width: 100%;
  max-height: 400px;
  object-fit: contain;
}

/* 添加详情弹窗相关样式 */
.mistake-detail-dialog :deep(.el-dialog__body) {
  padding: 0;  /* 移除内边距以便图片充满弹窗 */
  height: calc(95vh - 100px);  /* 增加高度到95vh */
  overflow: hidden;  /* 防止出现滚动条 */
}

.detail-container {
  height: 100%;  /* 让容器占满整个高度 */
  display: flex;
  flex-direction: column;
  position: relative;
}

.mistake-section,
.answer-section {
  flex: 1;  /* 让图片区域占满剩余空间 */
  display: flex;
  flex-direction: column;
}

.detail-image {
  width: 100%;
  height: 100%;  /* 让图片占满整个区域 */
  object-fit: contain;  /* 保持图片比例 */
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

.answer-control button {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.answer-control button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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

/* 添加按钮悬停效果 */
.confirm-area button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 15px rgba(64, 158, 255, 0.3);
}

/* 添加确认按钮动画 */
.confirm-area button:after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  background: rgba(255, 255, 255, 0.5);
  opacity: 0;
  border-radius: 100%;
  transform: scale(1, 1) translate(-50%);
  transform-origin: 50% 50%;
}

.confirm-area button:focus:not(:active)::after {
  animation: ripple 1s ease-out;
}

@keyframes ripple {
  0% {
    transform: scale(0, 0);
    opacity: 0.5;
  }
  20% {
    transform: scale(25, 25);
    opacity: 0.3;
  }
  100% {
    opacity: 0;
    transform: scale(40, 40);
  }
}

/* 弹窗动画 */
.mistake-detail-dialog :deep(.el-dialog) {
  animation: dialogFadeIn 0.3s ease-out;
}

@keyframes dialogFadeIn {
  from {
    opacity: 0;
    transform: translateY(-30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>