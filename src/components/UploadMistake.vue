<script setup lang="ts">
import { ref, computed, onUnmounted, onMounted } from 'vue'

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
}

const fileList = ref<FileItem[]>([])
const isDragging = ref(false)
const errorMessage = ref<string | null>(null)

// 计算属性
const isUploadDisabled = computed(() => {
  return fileList.value.length === 0 || 
         fileList.value.some(file => file.status === 'uploading')
})

const hasUploadingFiles = computed(() => {
  return fileList.value.some(file => file.status === 'uploading')
})

const showError = (message: string, isWarning = false) => {
  errorMessage.value = message
  setTimeout(() => {
    errorMessage.value = null
  }, 3000)
}

// 清理函数
let removeProgressListener: (() => void) | null = null

onUnmounted(() => {
  removeProgressListener?.()
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
    const filePath = await window.ipcRenderer.uploadFile.select()
    console.log('选择的文件路径:', filePath)
    
    if (filePath) {
      const preview = await window.ipcRenderer.uploadFile.getPreview(filePath)
      fileList.value.push({
        path: filePath,
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
const startUpload = async () => {
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
          // 确保 fileId 存在再设置
          if (progress.fileId) {
            console.log('设置文件ID:', progress.fileId)
            file.fileId = progress.fileId
          }
          if (progress.fileInfo) {
            file.uploadDate = progress.fileInfo.uploadDate
            file.originalDate = progress.fileInfo.originalDate
          }
          showError('上传成功！', true)
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
    const filePaths = fileList.value.map(file => file.path)
    console.log('开始调用上传方法,文件路径:', filePaths)
    const result = await window.ipcRenderer.uploadFile.start(filePaths)
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
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      showError('只能上传图片文件！')
      continue
    }
    
    if (await addFileToList(file.path)) {
      addedCount++
    }
  }
  
  if (addedCount > 0) {
    await startUpload()
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

// 添加文件到列表
const addFileToList = async (filePath: string) => {
  if (isFileDuplicate(filePath)) {
    showError('文件已添加，请勿重复选择相同文件')
    return false
  }

  try {
    const preview = await window.ipcRenderer.uploadFile.getPreview(filePath)
    fileList.value.push({
      path: filePath,
      preview: preview.previewUrl,
      progress: 0,
      status: 'idle',
      error: null
    })
    return true
  } catch (error) {
    console.error('获取文件预览失败:', error)
    showError('获取文件预览失败，请重试')
    return false
  }
}

// 清理已完成的文件
const clearCompletedFiles = () => {
  fileList.value = fileList.value.filter(
    file => file.status !== 'completed' && file.status !== 'error'
  )
}

// 移除单个文件
const removeFile = async (filePath: string) => {
  const file = fileList.value.find(f => f.path === filePath)
  if (file?.status === 'uploading') {
    await cancelUpload(filePath)
  }
  fileList.value = fileList.value.filter(f => f.path !== filePath)
}
</script>

<template>
  <div class="upload-container">
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
             :class="{ 'error': file.status === 'error' }">
          <img :src="file.preview" alt="Preview" />
          <div class="file-info">
            <p class="file-name">{{ file.path.split('/').pop() }}</p>
            <template v-if="file.status === 'completed'">
              <p class="file-date" v-if="file.uploadDate">
                上传���期: {{ file.uploadDate }}
              </p>
              <p class="file-date" v-if="file.originalDate">
                创建日期: {{ file.originalDate }}
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
        @click="clearCompletedFiles"
        v-if="fileList.some(f => f.status === 'completed' || f.status === 'error')"
        class="clear-btn">
        清理已完成
      </button>
    </div>
  </div>
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 16px;
}

.preview-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f5f5;
  padding: 8px;
}

.preview-item.error {
  border: 1px solid #ff4444;
}

.preview-item img {
  width: 100%;
  height: 150px;
  object-fit: cover;
  border-radius: 4px;
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
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  cursor: pointer;
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
</style>
