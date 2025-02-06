import { ipcRenderer, contextBridge } from 'electron'

// 添加 Result 类型定义
interface Result<T = any> {
  success: boolean
  data?: T
  error?: string
}

// 添加在文件开头的类型定义
interface UploadError extends Error {
  code?: string
  path?: string
}

interface UploadProgress {
  filePath: string
  fileId?: string
  progress: number
  status: 'idle' | 'uploading' | 'completed' | 'error' | 'cancelled'
  error?: string
  fileInfo?: {
    uploadDate: string
    originalDate: string
  }
}

interface UploadResult {
  success: boolean
  results?: Array<{
    filePath: string
    success: boolean
    targetPath?: string
    error?: string
  }>
  message?: string
}

// 在已有的接口定义后添加新的接口
export interface TrainingRecord {
  date: string
  result: 'success' | 'fail'
  proficiencyBefore: number
  proficiencyAfter: number
  intervalAfter: number
  isOnTime: boolean
}

export interface MistakeItem {
  fileId: string
  path: string
  preview: string
  uploadDate: string
  originalDate: string
  originalFileName: string
  fileSize: number
  lastModified: string
  hash?: string
  metadata: {
    proficiency: number
    trainingInterval: number
    lastTrainingDate: string
    nextTrainingDate: string
    subject: string
    tags: string[]
    notes: string
    trainingRecords: TrainingRecord[]
    type?: 'mistake' | 'answer'
    pairId?: string
    isPaired?: boolean
    answerTimeLimit: number
  }
}

interface MistakeListResult {
  success: boolean
  data: MistakeItem[]
  error?: string
}

// 在已有的接口定义后添加新的训练相关接口
interface TrainingResult<T = any> {
  success: boolean
  data?: T
  error?: string
}

interface TrainingNextInfo {
  nextTrainingDate: string
  currentProficiency: number
  currentInterval: number
  answerTimeLimit: number
}

// 在现有的接口定义中添加配置相关的类型
export interface TrainingConfig {
  proficiencyIntervals: Array<{
    range: [number, number]
    interval: number
    description: string
  }>
}

// 添加类型定义
interface UploadAPI {
  uploadFile: (filePaths: string[]) => Promise<{
    success: boolean
    error?: string
  }>
  uploadPastedFile: (file: File) => Promise<{
    success: boolean
    error?: string
  }>
}

// 在已有的接口定义后添加新的接口
interface ExportMistakeParams {
  mistake: MistakeItem
  answer: MistakeItem | null
  exportTime: string
}

interface ExportMistakeResult {
  success: boolean
  error?: string
  data?: {
    exportPath: string
  }
}

// 在接口定义部分添加新的类型
interface ExportToWordItem {
  mistake: {
    path: string
    metadata?: any
  }
  answer?: {
    path: string
    metadata?: any
  }
}

interface ExportToWordResult {
  success: boolean
  data?: {
    filePath: string
  }
  error?: string
}

export interface IpcRenderer {
  // 基础 IPC 方法
  on(channel: string, func: (...args: any[]) => void): void
  off(channel: string, func: (...args: any[]) => void): void
  send(channel: string, ...args: any[]): void
  invoke(channel: string, ...args: any[]): Promise<any>

  // mistake 相关方法
  mistake: {
    getMistakes: () => Promise<Result<MistakeItem[]>>
    getTrainingHistory: () => Promise<Result<MistakeItem[]>>
  }

  // 文件相关方法
  file: {
    export: (paths: string[]) => Promise<{
      success: boolean
      exportPath?: string
      error?: string
    }>
    exportTrainingHistory: () => Promise<{
      success: boolean
      exportPath?: string
      error?: string
    }>
    delete: (fileId: string) => Promise<{
      success: boolean
      error?: string
    }>
    exportMistake: (params: ExportMistakeParams) => Promise<ExportMistakeResult>
    getMistakeDetails: (fileId: string) => Promise<Result<MistakeItem[]>>
    getExportedMistakes: () => Promise<Result<MistakeItem[]>>
    deleteExportedMistakes: (date: string) => Promise<{
      success: boolean
      error?: string
    }>
    exportToWord: (items: ExportToWordItem[]) => Promise<ExportToWordResult>
  }
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  // 基础 IPC 方法
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // mistake 相关方法
  mistake: {
    getMistakes: () => ipcRenderer.invoke('file:get-mistakes'),
    getTrainingHistory: () => ipcRenderer.invoke('file:get-training-history')
  },

  // metadata 相关方法
  metadata: {
    updateType: (fileId: string, type: 'mistake' | 'answer') => 
      ipcRenderer.invoke('metadata:update-type', fileId, type),
    pairImages: (fileId1: string, fileId2: string) => 
      ipcRenderer.invoke('metadata:pair-images', fileId1, fileId2),
    unpairImages: (fileId1: string, fileId2: string) => 
      ipcRenderer.invoke('metadata:unpair-images', fileId1, fileId2),
    updateDetails: (fileId: string, answerTimeLimit: number) => 
      ipcRenderer.invoke('metadata:update-details', fileId, answerTimeLimit),
    getAllTags: () => ipcRenderer.invoke('metadata:get-all-tags'),
    getFrozen: (fileId: string) => ipcRenderer.invoke('metadata:get-frozen', fileId),
    setFrozen: (fileId: string, isFrozen: boolean) => 
      ipcRenderer.invoke('metadata:set-frozen', fileId, isFrozen),
    setMultipleFrozen: (fileIds: string[], isFrozen: boolean) => 
      ipcRenderer.invoke('metadata:set-multiple-frozen', fileIds, isFrozen)
  },

  // training 相关方法
  training: {
    submitResult: async (fileId: string, success: boolean, trainingDate?: string): Promise<TrainingResult> => {
      if (!fileId?.trim()) {
        return { success: false, error: '无效的文件ID' }
      }
      return await ipcRenderer.invoke('training:submit-result', fileId, success, trainingDate)
    },
    getHistory: async (fileId: string): Promise<TrainingResult<TrainingRecord[]>> => {
      if (!fileId?.trim()) {
        return { success: false, error: '无效的文件ID' }
      }
      return await ipcRenderer.invoke('training:get-history', fileId)
    },
    getNextTraining: async (fileId: string): Promise<TrainingResult<TrainingNextInfo>> => {
      if (!fileId?.trim()) {
        return { success: false, error: '无效的文件ID' }
      }
      return await ipcRenderer.invoke('training:get-next', fileId)
    }
  },

  // file 相关方法
  file: {
    export: (paths: string[]) => ipcRenderer.invoke('file:export', paths),
    exportTrainingHistory: (sortType?: string, sortOrder?: string) => 
      ipcRenderer.invoke('file:export-training-history', sortType, sortOrder),
    delete: (fileId: string) => ipcRenderer.invoke('file:delete', fileId),
    exportMistake: (params: ExportMistakeParams) => 
      ipcRenderer.invoke('file:export-mistake', params),
    getMistakeDetails: (fileId: string) => ipcRenderer.invoke('file:get-mistake-details', fileId),
    getExportedMistakes: () => ipcRenderer.invoke('file:get-exported-mistakes'),
    deleteExportedMistakes: (date: string) => ipcRenderer.invoke('file:delete-exported-mistakes', date),
    exportToWord: (items: ExportToWordItem[]) => 
      ipcRenderer.invoke('file:export-to-word', items)
  }
})

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }

}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)

// 文件路径验证函数
const validatePath = (path: string): boolean => {
  if (!path || typeof path !== 'string') return false
  // Windows 路径或 Unix 路径
  return path.match(/^([a-zA-Z]:\\|\/)/i) !== null
}

// 确保类型定义正确
declare global {
  interface Window {
    ipcRenderer: {
      // ... 其他接口的类型定义
      mistake: {
        getMistakes: () => Promise<{
          success: boolean
          data: MistakeItem[]
          error?: string
        }>
      }
      config: {
        getTrainingConfig: () => Promise<{
          success: boolean
          data?: TrainingConfig
          error?: string
        }>
        updateTrainingConfig: (config: TrainingConfig) => Promise<{
          success: boolean
          error?: string
        }>
      }
      upload: UploadAPI
      file: {
        export: (paths: string[]) => Promise<{
          success: boolean
          exportPath?: string
          error?: string
        }>
        exportTrainingHistory: () => Promise<{
          success: boolean
          exportPath?: string
          error?: string
        }>
        delete: (fileId: string) => Promise<{
          success: boolean
          error?: string
        }>
        exportMistake: (params: ExportMistakeParams) => Promise<ExportMistakeResult>
        getMistakeDetails: (fileId: string) => Promise<Result<MistakeItem[]>>
        getExportedMistakes: () => Promise<Result<MistakeItem[]>>
        deleteExportedMistakes: (date: string) => Promise<{
          success: boolean
          error?: string
        }>
        exportToWord: (items: ExportToWordItem[]) => Promise<ExportToWordResult>
      }
    }
  }
}

