<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { MistakeItem } from '../../electron/preload'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'

const route = useRoute()
const uploadedFileIds = ref<string[]>([])
const mistakeList = ref<MistakeItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const draggedItem = ref<MistakeItem | null>(null)
const dragOverItem = ref<MistakeItem | null>(null)
const dialogVisible = ref(false)
const activeItem = ref<MistakeItem | null>(null)
const previewVisible = ref(false)
const previewItem = ref<MistakeItem | null>(null)
const showAnswer = ref(false)

onMounted(async () => {
  try {
    const uploadedFilesStr = localStorage.getItem('recentlyUploadedFiles')
    const uploadedFiles = uploadedFilesStr ? JSON.parse(uploadedFilesStr) : []
    console.log('获取到的上传文件:', uploadedFiles)
    
    const result = await window.ipcRenderer.uploadFile.getMistakes()
    if (result.success && result.data) {
      // 修改匹配逻辑：只比较文件名而不是完整路径
      mistakeList.value = result.data.filter(item => {
        // 获取文件名
        const getFileName = (path: string) => {
          const parts = path.split('\\').pop()?.split('/') || []
          return parts[parts.length - 1]
        }
        
        const itemFileName = getFileName(item.itemPath || item.path || '')
        
        const matches = uploadedFiles.some(f => {
          const uploadedFileName = getFileName(f.path || '')
          console.log('比较文件名:', {
            itemFileName,
            uploadedFileName,
            isMatch: itemFileName === uploadedFileName
          })
          return itemFileName === uploadedFileName
        })
        
        return matches && !item.metadata?.isPaired
      })
      
      console.log('过滤后的文件列表:', mistakeList.value)
      
      if (mistakeList.value.length > 0) {
        // 将一半设置为答案类型
        const halfLength = Math.floor(mistakeList.value.length / 2)
        for (let i = 0; i < halfLength; i++) {
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
      // 拖到另一个配对项，交换位置
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
    await window.ipcRenderer.metadata.pairImages(item1.fileId, item2.fileId)
    ElMessage.success('配对成功！')
    
    // 确保错题在前，答案在后
    const [mistakeItem, answerItem] = item1.metadata.type === 'mistake' 
      ? [item1, item2] 
      : [item2, item1]
    
    // 更新状态
    mistakeItem.metadata.isPaired = true
    mistakeItem.metadata.pairId = `pair_${Date.now()}`
    mistakeItem.metadata.pairedWith = answerItem
    
    // 从列表中移除答案项
    mistakeList.value = mistakeList.value.filter(item => item !== answerItem)
    
  } catch (error) {
    ElMessage.error('配对失败')
  }
}

// 添加解绑函数
const unpairItems = async (item: MistakeItem) => {
  if (!item.metadata.pairedWith) return
  
  try {
    // 完整调用解绑 API
    await window.ipcRenderer.metadata.unpairImages(item.fileId, item.metadata.pairedWith.fileId)
    
    // 获取配对项
    const pairedItem = item.metadata.pairedWith
    
    // 重置两个项目的状态
    item.metadata.isPaired = false
    item.metadata.pairId = null
    item.metadata.pairedWith = null
    
    if (pairedItem) {
      pairedItem.metadata.isPaired = false
      pairedItem.metadata.pairId = null
      pairedItem.metadata.pairedWith = null
      
      // 将答案项添加回列表的适当位置
      const mistakeIndex = mistakeList.value.indexOf(item)
      mistakeList.value.splice(mistakeIndex + 1, 0, pairedItem)
    }
    
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

// 添加查看详情的处理函数
const handleViewDetail = (item: MistakeItem) => {
  if (item.metadata.isPaired) {
    activeItem.value = item
    dialogVisible.value = true
  }
}

// 添加关闭弹窗的处理函数
const handleCloseDialog = () => {
  dialogVisible.value = false
  activeItem.value = null
  showAnswer.value = false
}

// 添加预览处理函数
const handlePreview = (item: MistakeItem) => {
  previewItem.value = item
  previewVisible.value = true
}

// 添加关闭预览处理函数
const handleClosePreview = () => {
  previewVisible.value = false
  previewItem.value = null
}

// 添加切换答案显示的函数
const toggleAnswer = () => {
  showAnswer.value = !showAnswer.value
}
</script>

<template>
  <div class="pair-mistake-container">
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
               @click="item.metadata.isPaired ? handleViewDetail(item) : null"
               @dragstart="handleDragStart(item, $event)"
               @dragover="handleDragOver(item, $event)"
               @dragend="handleDragEnd">
            <el-image 
              :src="item.preview" 
              :preview-src-list="[]"
              fit="contain"
              class="preview-image"
              @click.stop="item.metadata.isPaired ? handleViewDetail(item) : handlePreview(item)"
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

  <!-- 添加预览弹窗 -->
  <el-dialog
    v-model="previewVisible"
    :title="previewItem?.metadata.type === 'mistake' ? '错题预览' : '答案预览'"
    width="80%"
    :before-close="handleClosePreview"
    class="preview-dialog"
  >
    <div class="preview-container" v-if="previewItem">
      <el-image 
        :src="previewItem.preview"
        :preview-src-list="[previewItem.preview]"
        fit="contain"
        class="preview-detail-image"
      />
      <div class="preview-info">
        <p class="preview-filename">{{ previewItem.originalFileName }}</p>
        <p class="preview-type">
          {{ previewItem.metadata.type === 'mistake' ? '错题' : '答案' }}
        </p>
      </div>
    </div>
  </el-dialog>

  <!-- 添加详情弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    :title="activeItem?.metadata.type === 'mistake' ? '错题详情' : '答案详情'"
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
        <div class="detail-info">
          <p class="detail-filename">{{ activeItem.originalFileName }}</p>
          <p class="detail-type">{{ activeItem.metadata.type === 'mistake' ? '错题' : '答案' }}</p>
        </div>
      </div>
      
      <div class="answer-control">
        <el-button 
          type="primary" 
          @click="toggleAnswer"
          :icon="showAnswer ? 'Hide' : 'View'"
        >
          {{ showAnswer ? '隐藏答案' : '查看答案' }}
        </el-button>
      </div>
      
      <div class="answer-section" v-if="showAnswer && activeItem.metadata.pairedWith">
        <el-image 
          :src="activeItem.metadata.pairedWith.preview"
          :preview-src-list="[activeItem.metadata.pairedWith.preview]"
          fit="contain"
          class="detail-image"
        />
        <div class="detail-info">
          <p class="detail-filename">{{ activeItem.metadata.pairedWith.originalFileName }}</p>
          <p class="detail-type">答案</p>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.pair-mistake-container {
  padding: 20px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.preview-area {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 20px;
}

.preview-item {
  position: relative;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 12px;
  transition: all 0.3s ease;
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

/* 响应式布局调整 */
@media screen and (max-width: 768px) {
  .preview-area {
    grid-template-columns: 1fr;
  }
}

@media screen and (min-width: 769px) and (max-width: 1200px) {
  .preview-area {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media screen and (min-width: 1201px) {
  .preview-area {
    grid-template-columns: repeat(3, 1fr);
  }
}

.preview-item.is-dragging {
  opacity: 0.5;
  transform: scale(0.95);
}

.preview-item.can-pair {
  border-color: var(--el-color-success);
  box-shadow: 0 0 15px var(--el-color-success);
  transform: scale(1.05);
}

.preview-item.no-pair {
  border-color: var(--el-color-warning);
  box-shadow: 0 0 15px var(--el-color-warning);
}

/* 添加拖拽时的动画效果 */
.preview-item {
  transition: all 0.3s ease, transform 0.2s ease;
}

/* 配对成功时的样式 */
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

.mistake-detail-dialog :deep(.el-dialog__body) {
  padding: 20px;
}

.detail-container {
  display: flex;
  gap: 20px;
  justify-content: space-between;
}

.mistake-section,
.answer-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-image {
  width: 100%;
  height: 70vh;
  object-fit: contain;
  border-radius: 8px;
  background-color: #f5f7fa;
}

.detail-info {
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.detail-filename {
  font-size: 16px;
  margin-bottom: 8px;
}

.detail-type {
  font-size: 14px;
  color: #909399;
}

.preview-item.is-paired .preview-image {
  cursor: pointer;
}

.preview-item:not(.is-paired) .preview-image {
  cursor: zoom-in;
}

.preview-dialog :deep(.el-dialog__body) {
  padding: 20px;
}

.preview-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-detail-image {
  width: 100%;
  height: 70vh;
  object-fit: contain;
  border-radius: 8px;
  background-color: #f5f7fa;
}

.preview-info {
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.preview-filename {
  font-size: 16px;
  margin-bottom: 8px;
}

.preview-type {
  font-size: 14px;
  color: #909399;
}

.answer-control {
  display: flex;
  justify-content: center;
  padding: 16px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin: 16px 0;
}

.detail-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.answer-section {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>