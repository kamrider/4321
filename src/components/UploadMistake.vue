<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

// 文件状态管理
const selectedFile = ref<string | null>(null)
const uploadProgress = ref<number>(0)
const uploadStatus = ref<'idle' | 'uploading' | 'completed' | 'error'>('idle')
const previewUrl = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

// 计算属性
const isUploadDisabled = computed(() => !selectedFile.value || uploadStatus.value === 'uploading')

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
  if (uploadStatus.value === 'uploading') {
    console.log('检测到正在上传,准备取消当前上传')
    await cancelUpload()
  }
  try {
    console.log('调用文件选择对话框...')
    const filePath = await window.ipcRenderer.uploadFile.select()
    console.log('选择的文件路径:', filePath)
    
    if (filePath) {
      selectedFile.value = filePath
      console.log('获取文件预览...')
      const preview = await window.ipcRenderer.uploadFile.getPreview(filePath)
      console.log('预览数据:', preview)
      previewUrl.value = preview.previewUrl
    }
  } catch (error) {
    console.error('文件选择错误:', error)
    showError('选择文件失败，请重试！')
  }
}

// 开始上传
const startUpload = async () => {
  console.log('开始上传流程...')
  if (!selectedFile.value) {
    console.log('没有选择文件,上传终止')
    return
  }
  
  console.log('设置上传状态为uploading')
  uploadStatus.value = 'uploading'
  
  // 设置进度监听
  removeProgressListener = window.ipcRenderer.uploadFile.onProgress((progress) => {
    console.log('上传进度:', progress)
    uploadProgress.value = progress.progress

    switch (progress.status) {
      case 'uploading':
        console.log('文件正在上传中...')
        uploadStatus.value = 'uploading'
        break
      case 'completed':
        console.log('上传完成')
        uploadStatus.value = 'completed'
        showError('上传成功！', true)
        break
      case 'cancelled':
        console.log('上传已取消')
        uploadStatus.value = 'idle'
        uploadProgress.value = 0
        break
      case 'error':
        console.log('上传出错')
        uploadStatus.value = 'error'
        showError('上传过程中出错，请重试！')
        break
    }
  })
  
  try {
    console.log('开始调用上传方法,文件路径:', selectedFile.value)
    await window.ipcRenderer.uploadFile.start(selectedFile.value)
    console.log('上传方法调用完成')
    uploadStatus.value = 'completed'
  } catch (error) {
    console.error('上传错误详情:', error)
    uploadStatus.value = 'error'
    showError('上传失败，请重试！')
  }
}

// 取消上传
const cancelUpload = async () => {
  await window.ipcRenderer.uploadFile.cancel()
  uploadStatus.value = 'idle'
  uploadProgress.value = 0
  showError('上传已取消', true)
}
</script>

<template>
  <div class="upload-container">
    <div class="message" 
         v-if="errorMessage" 
         :class="{ 'warning': uploadStatus === 'completed' || uploadStatus === 'cancelled' }">
      <span class="icon">{{ uploadStatus === 'completed' ? '✅' : '⚠️' }}</span>
      {{ errorMessage }}
    </div>
    
    <div class="preview-area" v-if="previewUrl">
      <img :src="previewUrl" alt="Preview" />
    </div>
    
    <div class="controls">
      <button @click="handleFileSelect">
        {{ uploadStatus === 'uploading' ? '更换文件' : '选择文件' }}
      </button>
      <button 
        @click="startUpload" 
        :disabled="isUploadDisabled">
        上传
      </button>
      <button 
        @click="cancelUpload"
        v-if="uploadStatus === 'uploading'"
        class="cancel-btn">
        取消
      </button>
    </div>
    
    <div class="progress-container" v-if="uploadStatus === 'uploading'">
      <div class="progress-bar">
        <div class="progress" :style="{ width: `${uploadProgress}%` }"></div>
      </div>
      <span class="progress-text">{{ uploadProgress }}%</span>
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
</style>
