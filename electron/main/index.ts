import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import * as fs from 'fs'
import Store from 'electron-store'
import { MetadataManager } from './metadata'
import { TrainingManager } from './training-manager'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// 初始化 store 和默认路径
const store = new Store()
const DEFAULT_STORAGE_PATH = path.join(app.getPath('userData'), 'uploads')
let isCancelled = false

// 获取存储路径，如果不存在则使用默认路径
let targetDirectory = store.get('storagePath', DEFAULT_STORAGE_PATH)

// 检查路径是否存在且可写
try {
  if (!fs.existsSync(targetDirectory)) {
    fs.mkdirSync(targetDirectory, { recursive: true })
  }
  fs.accessSync(targetDirectory, fs.constants.W_OK)
} catch (error) {
  console.error('存储路径不可用，使用默认路径:', error)
  targetDirectory = DEFAULT_STORAGE_PATH
  store.set('storagePath', DEFAULT_STORAGE_PATH)
}

// 添加全局取消标志和取消映射
let isAllCancelled = false
const cancelMap: { [key: string]: boolean } = {}

// 验证文件路径
const validateFilePaths = (filePaths: string[]) => {
  return filePaths.filter(filePath => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    } catch {
      return false
    }
  })
}

// 添加元数据管理器
const metadataManager = new MetadataManager(targetDirectory)

// 初始化训练管理器
const trainingManager = new TrainingManager('config/training-config.json')

// 上传单个文件的函数
async function uploadSingleFile(event: Electron.IpcMainInvokeEvent, filePath: string) {
  try {
    // 检查全局取消状态
    if (isAllCancelled || cancelMap[filePath]) {
      return {
        filePath,
        success: false,
        message: isAllCancelled ? 'All uploads cancelled' : 'Upload cancelled'
      }
    }

    const fileName = path.basename(filePath)
    const targetPath = path.join(targetDirectory, fileName)
    const fileSize = fs.statSync(filePath).size
    const chunkSize = fileSize > 1024 * 1024 * 10 ? 1024 * 500 : 1024 * 100

    // 创建写入流
    const writeStream = fs.createWriteStream(targetPath)
    const readStream = fs.createReadStream(filePath)
    
    // 监听数据传输进度
    let totalSize = fs.statSync(filePath).size
    let uploadedSize = 0
    
    readStream.on('data', (chunk) => {
      uploadedSize += chunk.length
      const progress = Math.round((uploadedSize / totalSize) * 100)
      
      // 发送进度信息
      event.sender.send('file:progress', {
        filePath,
        progress,
        status: 'uploading',
        targetPath
      })
    })

    // 等待文件写入完成
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
      readStream.pipe(writeStream)
    })

    // 添加元数据并获取文件ID
    const fileId = await metadataManager.addFile(filePath, targetPath)
    
    // 发送完成状态
    event.sender.send('file:progress', {
      filePath,
      fileId,  // 确保包含 fileId
      progress: 100,
      status: 'completed',
      fileInfo: {
        uploadDate: new Date().toISOString().split('T')[0],
        originalDate: fs.statSync(filePath).birthtime.toISOString().split('T')[0]
      }
    })

    return {
      filePath,
      fileId,
      success: true,
      targetPath,
      message: `文件已保存至: ${targetPath}`
    }

  } catch (error) {
    console.error('上传文件失败:', error)
    
    // 发送错误状态
    event.sender.send('file:progress', {
      filePath,
      progress: 0,
      status: 'error',
      error: error.message
    })

    return {
      filePath,
      success: false,
      error: error.message
    }
  }
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
    win?.webContents.send('storage-path', targetDirectory);
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

ipcMain.handle('file:select', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
})

// 修改主上传处理器
ipcMain.handle('file:upload', async (event, filePaths) => {
  console.log('主进程收到上传请求,文件路径:', filePaths)
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths]
  
  const validPaths = validateFilePaths(paths)
  if (validPaths.length === 0) {
    return { success: false, message: '没有有效的文件可上传' }
  }

  // 重置取消状态
  isAllCancelled = false
  validPaths.forEach(path => cancelMap[path] = false)
  
  const results = await Promise.all(
    validPaths.map(path => uploadSingleFile(event, path))
  )

  const failedFiles = results.filter(result => !result.success)
  if (failedFiles.length > 0) {
    console.warn('以下文件上传失败:', failedFiles.map(file => file.filePath))
  }

  return { 
    results, 
    success: failedFiles.length === 0,
    message: failedFiles.length > 0 
      ? `${failedFiles.length} 个文件上传失败` 
      : '所有文件上传成功'
  }
})

// 修改取消处理器
ipcMain.handle('file:cancel', async (event, filePath) => {
  if (filePath) {
    cancelMap[filePath] = true
    return { success: true, filePath }
  } else {
    isAllCancelled = true
    Object.keys(cancelMap).forEach(path => cancelMap[path] = true)
    return { success: true, message: '已取消所有上传' }
  }
})

ipcMain.handle('file:preview', async (event, filePath) => {
  try {
    const supportedExtensions = ['jpg', 'jpeg', 'png'];
    const fileExtension = path.extname(filePath).toLowerCase().slice(1);

    if (!supportedExtensions.includes(fileExtension)) {
      throw new Error('Unsupported file type for preview.');
    }

    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    return { previewUrl: `data:image/${fileExtension};base64,${base64Data}` };
  } catch (error) {
    console.error('Error generating preview:', error);
    throw new Error('Unable to generate preview');
  }
})

// 添加获取存储目录的处理程序
ipcMain.handle('file:get-storage-path', () => {
  return targetDirectory;
})

// 添加设置存储目录的处理程序
ipcMain.handle('file:set-storage-path', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择文件存储位置'
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0]
    try {
      // 验证路径是否可写
      await fs.promises.access(newPath, fs.constants.W_OK)
      
      // 开始迁移
      const migrationResult = await metadataManager.migrateStorage(newPath)
      
      if (!migrationResult.success) {
        event.sender.send('file:error', {
          type: 'migration',
          errors: migrationResult.errors
        })
        throw new Error('迁移失败：' + migrationResult.errors.join('\n'))
      }
      
      targetDirectory = newPath
      store.set('storagePath', targetDirectory)
      return { success: true, path: targetDirectory }
      
    } catch (error) {
      throw new Error(`设置存储路径失败: ${error.message}`)
    }
  }
  return { success: false, message: '未选择新路径' }
})

// 添加重置存储目录的处理程序
ipcMain.handle('file:reset-storage-path', () => {
  if (!fs.existsSync(DEFAULT_STORAGE_PATH)) {
    fs.mkdirSync(DEFAULT_STORAGE_PATH, { recursive: true });
  }
  targetDirectory = DEFAULT_STORAGE_PATH;
  store.set('storagePath', DEFAULT_STORAGE_PATH);
  return DEFAULT_STORAGE_PATH;
});

// 添加在其他 IPC 处理程序旁边
ipcMain.handle('file:get-metadata', () => {
  return metadataManager.getMetadata()
})


ipcMain.handle('file:get-mistakes', async () => {
  try {
    // 检查存储路径是否存在
    if (!fs.existsSync(targetDirectory)) {
      return {
        success: false,
        data: [],
        error: '存储路径不存在'
      };
    }

    // 从元数据管理器获取所有文件信息
    const metadata = await metadataManager.getMetadata();
    const allFiles = Object.entries(metadata.files);
    
    // 创建一个 Map 来存储所有文件
    const fileMap = new Map();
    
    // 第一步：处理所有文件的基���息
    for (const [id, file] of allFiles) {
      try {
        const filePath = path.join(targetDirectory, file.relativePath);
        const fileData = await fs.promises.readFile(filePath);
        const fileExtension = path.extname(filePath).toLowerCase().slice(1);
        const base64Data = fileData.toString('base64');
        
        fileMap.set(id, {
          fileId: id,
          path: filePath,
          preview: `data:image/${fileExtension};base64,${base64Data}`,
          uploadDate: file.uploadDate,
          originalDate: file.originalDate,
          originalFileName: file.originalFileName,
          fileSize: file.fileSize,
          lastModified: file.lastModified,
          hash: file.hash,
          metadata: {
            ...file,
            pairedWith: null  // 初始化 pairedWith 为 null
          }
        });
      } catch (error) {
        console.error(`处理文件 ${id} 失败:`, error);
      }
    }
    
    // 第二步：处理配对关系
    for (const [id, file] of allFiles) {
      if (file.isPaired && file.pairId) {
        const currentFile = fileMap.get(id);
        // 查找所有具有相同 pairId 的配对文件
        const pairedFiles = Array.from(fileMap.values()).filter(
          f => f.metadata.pairId === file.pairId && f.fileId !== id
        );
        
        if (currentFile && pairedFiles.length > 0) {
          currentFile.metadata.pairedWith = pairedFiles;
        }
      }
    }
    
    const validMistakes = Array.from(fileMap.values());
    
    return {
      success: true,
      data: validMistakes
    };
  } catch (error) {
    console.error('获取错题列表失败:', error);
    return {
      success: false,
      data: [],
      error: error.message
    };
  }
});

// 提交训练结果
ipcMain.handle('training:submit-result', async (event, fileId: string, success: boolean, trainingDate?: string) => {
  try {
    const metadata = await metadataManager.getMetadata()
    const fileMetadata = metadata.files[fileId]
    
    if (!fileMetadata) {
      throw new Error('文件不存在')
    }

    // 处理训练结果
    const updatedFields = await trainingManager.processTraining(fileMetadata, success, trainingDate)
    
    // 更新元数据
    Object.assign(fileMetadata, updatedFields)
    await metadataManager.saveMetadata()

    return {
      success: true,
      data: fileMetadata
    }
  } catch (error) {
    console.error('处理训练结果失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 获取训练历史
ipcMain.handle('training:get-history', async (event, fileId: string) => {
  try {
    const metadata = await metadataManager.getMetadata()
    const fileMetadata = metadata.files[fileId]
    
    if (!fileMetadata) {
      throw new Error('文件不存在')
    }

    return {
      success: true,
      data: fileMetadata.trainingRecords
    }
  } catch (error) {
    console.error('获取训练历史失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 获取下次训练信息
ipcMain.handle('training:get-next', async (event, fileId: string) => {
  try {
    const metadata = await metadataManager.getMetadata()
    const fileMetadata = metadata.files[fileId]
    
    if (!fileMetadata) {
      throw new Error('文件不存在')
    }

    return {
      success: true,
      data: {
        nextTrainingDate: fileMetadata.nextTrainingDate,
        currentProficiency: fileMetadata.proficiency,
        currentInterval: fileMetadata.trainingInterval
      }
    }
  } catch (error) {
    console.error('获取下次训练信息失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 更新图片类型
ipcMain.handle('metadata:update-type', async (_, fileId: string, type: 'mistake' | 'answer') => {
  try {
    const metadata = await metadataManager.getMetadata()
    if (metadata.files[fileId]) {
      metadata.files[fileId].type = type
      await metadataManager.saveMetadata(metadata)
      return { success: true }
    }
    return { success: false, error: '文件不存在' }
  } catch (error) {
    console.error('更新类型失败:', error)
    return { success: false, error: '更新类型失败' }
  }
})

// 配对图片
ipcMain.handle('metadata:pair-images', async (_, fileId1: string, fileId2: string) => {
  try {
    const metadata = await metadataManager.getMetadata()
    if (metadata.files[fileId1] && metadata.files[fileId2]) {
      // 如果错题已经有 pairId，使用现有的；否则创建新的
      const mistakeFile = metadata.files[fileId1].type === 'mistake' 
        ? metadata.files[fileId1] 
        : metadata.files[fileId2]
      const answerFile = metadata.files[fileId1].type === 'answer' 
        ? metadata.files[fileId1] 
        : metadata.files[fileId2]
      
      const pairId = mistakeFile.pairId || `pair_${Date.now()}`
      
      // 使用相同的 pairId
      mistakeFile.pairId = pairId
      answerFile.pairId = pairId
      mistakeFile.isPaired = true
      answerFile.isPaired = true
      
      await metadataManager.saveMetadata(metadata)
      return { success: true }
    }
    return { success: false, error: '文件不存在' }
  } catch (error) {
    console.error('配对失败:', error)
    return { success: false, error: '配对失败' }
  }
})

// 添加在其他 IPC 处理程序旁边
ipcMain.handle('metadata:unpair-images', async (event, fileId1: string, fileId2: string) => {
  try {
    const metadata = await metadataManager.getMetadata()
    const file1 = metadata.files[fileId1]
    const file2 = metadata.files[fileId2]
    
    if (!file1 || !file2) {
      throw new Error('文件不存在')
    }

    // 重置配对状态
    file1.isPaired = false
    file1.pairId = null
    file2.isPaired = false
    file2.pairId = null

    // 保存更改
    await metadataManager.saveMetadata()

    return {
      success: true,
      message: '解绑成功'
    }
  } catch (error) {
    console.error('解绑失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 获取训练配置
ipcMain.handle('config:get-training-config', async () => {
  try {
    return {
      success: true,
      data: trainingManager.getDefaultConfig()
    }
  } catch (error) {
    console.error('获取训练配置失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 更新训练配置
ipcMain.handle('config:update-training-config', async (_, config: TrainingConfig) => {
  try {
    // 验证新配置
    if (!trainingManager.validateConfig(config)) {
      throw new Error('配置格式无效')
    }
    
    // 保存配置到文件
    const configPath = path.join(app.getPath('userData'), 'training-config.json')
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2))
    
    // 更新训练管理器中的配置
    trainingManager.updateConfig(config)
    
    return { success: true }
  } catch (error) {
    console.error('更新训练配置失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})
