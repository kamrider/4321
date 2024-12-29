<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

// 文件状态管理
interface FileItem {
  path: string
  fileId?: string        // 添加文件ID
  preview?: string
  progress: number
  status: 'idle' | 'uploading' | 'completed' | 'error'
  uploadDate?: string
  originalDate?: string
  relativePath?: string  // 添加相对路径
  hash?: string         // 添加文件哈希
  type?: 'mistake' | 'answer'
  pairId?: string
  isPaired?: boolean
  targetPath?: string
}

const fileList = ref<FileItem[]>([])
const isDragging = ref(false)
const errorMessage = ref<string | null>(null)
const router = useRouter()

// 计算属性
const isUploadDisabled = computed(() => {
  return fileList.value.length === 0 || 
         fileList.value.some(file => file.status === 'uploading')
})

const hasUploadingFiles = computed(() => {
  return fileList.value.some(file => file.status === 'uploading')
})

const showError = (message: string, isWarning = false) => {
  if (isWarning) {
    ElMessage.success(message)
  } else {
    ElMessage.error(message)
  }
}

// 清理函数
let removeProgressListener: (() => void) | null = null

onUnmounted(async () => {
  removeProgressListener?.()
  // 如果有未上传的文件，清理临时文件
  if (fileList.value.some(file => file.status !== 'completed')) {
    try {
      await window.ipcRenderer.uploadFile.cleanupTemp()
    } catch (error) {
      console.error('清理临时文件失败:', error)
    }
  }
})

// 文件选择
const handleFileSelect = async () => {
  console.log('开始选择文件...')
  if (hasUploadingFiles.value) {
    console.log('检测到正在上传,准备取消当前上传')
    await cancelUpload()
  }
  
  try {
    console.log('调用文件选择对话框...')
    const tempPath = await window.ipcRenderer.uploadFile.select()
    console.log('选择的文件路径:', tempPath)
    
    if (tempPath) {
      const preview = await window.ipcRenderer.uploadFile.getPreview(tempPath)
      fileList.value.push({
        path: tempPath,
        preview: preview.previewUrl,
        progress: 0,
        status: 'idle'
      })
    }
  } catch (error) {
    console.error('文件选择错误:', error)
    showError('选择文件失败，请重试！')
  }
}

// 开始上传
const startUpload = async (shouldRedirect = true) => {
  console.log('开始上传流程...')
  if (fileList.value.length === 0) {
    console.log('没有选择文件,上传终止')
    return
  }
  
  console.log('设置上传状态为uploading')
  fileList.value.forEach(file => file.status = 'uploading')
  
  // 设置进度监听
  removeProgressListener = window.ipcRenderer.uploadFile.onProgress((progress) => {
    console.log('上传进度:', progress)
    const file = fileList.value.find(file => file.path === progress.filePath)
    if (file) {
      file.progress = progress.progress || 0
      
      switch (progress.status) {
        case 'uploading':
          console.log('文件正在上传中...')
          file.status = 'uploading'
          break
        
        case 'completed':
          console.log('上传完成')
          file.status = 'completed'
          if (progress.fileId) {
            console.log('设置文件ID:', progress.fileId)
            file.fileId = progress.fileId
          }
          if (progress.fileInfo) {
            file.uploadDate = progress.fileInfo.uploadDate
            file.originalDate = progress.fileInfo.originalDate
          }
          if (progress.targetPath) {
            file.targetPath = progress.targetPath
          }
          
          // 检查是否所有文件都上传完成
          const allCompleted = fileList.value.every(f => f.status === 'completed')
          if (allCompleted && shouldRedirect) {
            const uploadedFiles = fileList.value
              .filter(f => f.status === 'completed')
              .map((f, index) => ({
                path: f.targetPath || f.path,
                fileId: f.fileId,
                uploadIndex: index  // 添加上传顺序索引
              }))
            
            if (uploadedFiles.length > 0) {
              localStorage.setItem('recentlyUploadedFiles', JSON.stringify(uploadedFiles))
              router.push('/pair-mistake')
            }
          }
          break
        
        case 'error':
          console.log('上传出错')
          file.status = 'error'
          file.progress = 0
          showError(progress.error || '上传过程中出错，请重试！')
          break
        
        case 'cancelled':
          console.log('上传已取消')
          file.status = 'idle'
          file.progress = 0
          break
        
        default:
          console.warn('未知的上传状态:', progress.status)
      }
    } else {
      console.warn('找不到对应的文件:', progress.filePath)
    }
  })
  
  try {
    const tempPaths = fileList.value.map(file => file.path)
    console.log('开始调用上传方法,临时文件路径:', tempPaths)
    const result = await window.ipcRenderer.uploadFile.start(tempPaths)
    console.log('上传结果:', result)
    
    if (!result.success) {
      showError(result.message || '部分文件上传失败')
    }
  } catch (error) {
    console.error('上传错误详情:', error)
    fileList.value.forEach(file => {
      if (file.status === 'uploading') {
        file.status = 'error'
      }
    })
    showError('上传失败，请重试！')
  }
}

// 取消上传
const cancelUpload = async (filePath?: string) => {
  await window.ipcRenderer.uploadFile.cancel(filePath)
  
  if (filePath) {
    const file = fileList.value.find(f => f.path === filePath)
    if (file) {
      file.status = 'idle'
      file.progress = 0
    }
  } else {
    fileList.value.forEach(file => {
      file.status = 'idle'
      file.progress = 0
    })
  }
  showError('上传已取消', true)
}

// 处理文件拖放
const handleFileDrop = async (event: DragEvent) => {
  isDragging.value = false
  const files = event.dataTransfer?.files
  
  if (!files || files.length === 0) return
  
  let addedCount = 0
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) {
      showError('只能上传图片文件！')
      continue
    }
    
    try {
      // 获取文件路径
      const filePath = (file as any).path
      if (!filePath) {
        showError('无法获取文件路径')
        continue
      }

      // 使用 handleDrop API 处理拖拽的文件
      const result = await window.ipcRenderer.uploadFile.handleDrop(filePath)

      if (result.success) {
        // 获取预览
        const preview = await window.ipcRenderer.uploadFile.getPreview(result.tempPath)
        
        // 添加到文件列表
        fileList.value.push({
          path: result.tempPath,
          preview: preview.previewUrl,
          progress: 0,
          status: 'idle'
        })
        
        addedCount++
      } else {
        showError(`文件 ${file.name} 准备失败: ${result.error}`)
      }
    } catch (error) {
      console.error('处理拖拽文件失败:', error)
      showError(`文件 ${file.name} 处理失败`)
    }
  }
  
  // 不再自动开始上传，让用户手动点击上传按钮
  if (addedCount > 0) {
    ElMessage.success('文件已准备好，请点击上传按钮开始上传')
  }
}

// 添加拖拽相关的事件监听
onMounted(() => {
  const dropZone = document.querySelector('.drop-zone')
  if (dropZone) {
    dropZone.addEventListener('dragenter', () => isDragging.value = true)
    dropZone.addEventListener('dragleave', () => isDragging.value = false)
  }
})

// 检查文件是否重复
const isFileDuplicate = (filePath: string) => {
  return fileList.value.some(file => file.path === filePath)
}

// 清空所有文件
const clearAllFiles = async () => {
  // 如果有正在上传的文件，先取消上传
  if (hasUploadingFiles.value) {
    await cancelUpload()
  }
  
  // 清理所有临时文件
  try {
    await window.ipcRenderer.uploadFile.cleanupTemp()
  } catch (error) {
    console.error('清理临时文件失败:', error)
  }
  
  fileList.value = []
}

// 移除单个文件
const removeFile = async (filePath: string) => {
  const file = fileList.value.find(f => f.path === filePath)
  if (file?.status === 'uploading') {
    await cancelUpload(filePath)
  }
  
  // 如果是临时文件，删除它
  if (file && file.status !== 'completed') {
    try {
      await window.ipcRenderer.uploadFile.cleanupTemp(filePath)
    } catch (error) {
      console.error('删除临时文件失败:', error)
    }
  }
  
  fileList.value = fileList.value.filter(f => f.path !== filePath)
}

// 添加日期格式化函数
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

// 添加预览状态
const dialogVisible = ref(false)
const activeFile = ref<FileItem | null>(null)

// 添加查看详情的处理函数
const handleViewDetail = (file: FileItem) => {
  activeFile.value = file
  dialogVisible.value = true
}

// 添加关闭弹窗的处理函数
const handleCloseDialog = () => {
  dialogVisible.value = false
  activeFile.value = null
}

// 添加粘贴处理函数
const handlePaste = async (event: ClipboardEvent) => {
  const items = event.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const clipboardFile = item.getAsFile()
      if (clipboardFile) {
        try {
          const arrayBuffer = await clipboardFile.arrayBuffer()
          const fileName = `screenshot-${Date.now()}.png`
          
          // 使用现有的文件列表逻辑
          const fileItem: FileItem = {
            path: fileName,
            progress: 0,
            status: 'uploading'
          }
          fileList.value.push(fileItem)

          // 上传到临时目录
          const result = await window.ipcRenderer.uploadFile.uploadPastedFile({
            buffer: arrayBuffer,
            type: clipboardFile.type,
            name: fileName
          })

          if (result.success) {
            // 获取预览
            const preview = await window.ipcRenderer.uploadFile.getPreview(result.tempPath)
            
            // 更新文件状态
            const index = fileList.value.findIndex(f => f.path === fileName)
            if (index !== -1) {
              fileList.value[index] = {
                ...fileList.value[index],
                path: result.tempPath,
                preview: preview.previewUrl,
                status: 'idle',
                progress: 0
              }
            }
            ElMessage.success('准备上传成功')
          } else {
            const index = fileList.value.findIndex(f => f.path === fileName)
            if (index !== -1) {
              fileList.value[index].status = 'error'
            }
            ElMessage.error(`准备上传失败: ${result.error}`)
          }
        } catch (error) {
          console.error('粘贴上传错误:', error)
          ElMessage.error('粘贴上传失败')
        }
      }
    }
  }
}
</script>

<template>
  <div class="upload-container" @paste="handlePaste">
    <div class="drop-zone"
         @dragover.prevent
         @dragleave.prevent
         @drop.prevent="handleFileDrop"
         :class="{ 'dragging': isDragging }">
      <div class="drop-zone-content" v-if="fileList.length === 0">
        <span class="icon">📁</span>
        <p>拖拽文件到此处或点击选择文件</p>
      </div>
      
      <div class="preview-area" v-else>
        <div v-for="file in fileList" 
             :key="file.path" 
             class="preview-item"
             :class="{ 'error': file.status === 'error' }"
             @click="handleViewDetail(file)">
          <el-image 
            :src="file.preview" 
            :preview-src-list="[]"
            fit="contain"
            class="preview-image"
            @click.stop="handleViewDetail(file)"
          />
          <div class="file-info">
            <p class="file-name">{{ file.path.split('/').pop() }}</p>
            <template v-if="file.status === 'completed'">
              <p class="file-date" v-if="file.uploadDate">
                上传日期: {{ formatDate(file.uploadDate) }}
              </p>
              <p class="file-date" v-if="file.originalDate">
                创建日期: {{ formatDate(file.originalDate) }}
              </p>
            </template>
            <p class="file-status">{{ file.status }}</p>
            <p v-if="file.error" class="error-text">{{ file.error }}</p>
          </div>
          <button class="remove-btn" @click="removeFile(file.path)">
            ✕
          </button>
          <div v-if="file.status === 'uploading'" class="file-progress">
            <div class="progress-bar">
              <div class="progress" :style="{ width: `${file.progress}%` }"></div>
            </div>
            <span class="progress-text">{{ file.progress }}%</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="controls">
      <button @click="handleFileSelect">选择文件</button>
      <button 
        @click="startUpload" 
        :disabled="isUploadDisabled">
        上传
      </button>
      <button 
        @click="cancelUpload"
        v-if="hasUploadingFiles"
        class="cancel-btn">
        取消
      </button>
      <button 
        @click="clearAllFiles"
        v-if="fileList.length > 0"
        class="clear-btn">
        清空列表
      </button>
    </div>
  </div>

  <!-- 添加详情弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    title="图片详情"
    width="80%"
    :before-close="handleCloseDialog"
    class="mistake-detail-dialog"
  >
    <div class="detail-container" v-if="activeFile">
      <div class="image-section">
        <el-image 
          :src="activeFile.preview"
          :preview-src-list="[activeFile.preview]"
          fit="contain"
          class="detail-image"
        />
        <div class="detail-info">
          <p class="detail-filename">{{ activeFile.path.split('/').pop() }}</p>
          <template v-if="activeFile.status === 'completed'">
            <p class="detail-date" v-if="activeFile.uploadDate">
              上传日期: {{ formatDate(activeFile.uploadDate) }}
            </p>
            <p class="detail-date" v-if="activeFile.originalDate">
              创建日期: {{ formatDate(activeFile.originalDate) }}
            </p>
          </template>
          <p class="detail-status" :class="activeFile.status">
            状态: {{ activeFile.status }}
          </p>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.upload-container {
  padding: 20px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message {
  background: #ff4444;
  color: white;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: fade-in 0.3s ease-out;
}

.message.warning {
  background: #4CAF50;
}

.preview-area {
  margin-bottom: 20px;
  text-align: center;
}

.preview-area img {
  max-width: 100%;
  max-height: 300px;
  border-radius: 4px;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.controls button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  background: #2c3e50;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
}

.controls button:hover:not(:disabled) {
  background: #34495e;
}

.controls button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.controls .cancel-btn {
  background: #e74c3c;
}

.controls .cancel-btn:hover {
  background: #c0392b;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  flex: 1;
  height: 20px;
  background: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.progress {
  height: 100%;
  background: #4CAF50;
  transition: width 0.3s ease;
}

.progress-text {
  min-width: 48px;
  font-size: 14px;
  color: #666;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.drop-zone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  transition: all 0.3s ease;
  margin-bottom: 20px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.drop-zone.dragging {
  border-color: #4CAF50;
  background: rgba(76, 175, 80, 0.1);
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.drop-zone-content .icon {
  font-size: 48px;
}

.drop-zone-content p {
  margin: 0;
  color: #666;
}

.preview-area {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 20px;
}

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

.preview-item.error {
  border: 1px solid #ff4444;
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

.file-status {
  font-size: 12px;
  color: #666;
}

.error-text {
  color: #ff4444;
  font-size: 12px;
}

.remove-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.3s ease;
  z-index: 1;
}

.remove-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.1);
}

.file-progress {
  margin-top: 8px;
}

.clear-btn {
  background: #666;
}

.clear-btn:hover {
  background: #555;
}

.file-date {
  font-size: 12px;
  color: #666;
  margin: 4px 0;
}

.mistake-detail-dialog :deep(.el-dialog__body) {
  padding: 20px;
}

.detail-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.image-section {
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

.detail-date {
  font-size: 14px;
  color: #909399;
  margin: 4px 0;
}

.detail-status {
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-block;
  margin-top: 8px;
}

.detail-status.completed {
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.detail-status.error {
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.detail-status.uploading {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.detail-status.idle {
  background-color: var(--el-color-info-light-9);
  color: var(--el-color-info);
}
</style>
