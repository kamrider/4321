import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import * as fs from 'fs'
import Store from 'electron-store'
import { MetadataManager } from './metadata'
import { TrainingManager } from './training-manager'
import type { TrainingConfig } from './training-manager'
import { v4 as uuidv4 } from 'uuid'
import { Document, Paragraph, ImageRun, HeadingLevel, AlignmentType, Packer } from 'docx'
import sharp from 'sharp'

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

// 根据环境设置不同的应用名和路径
const isDevelopment = process.env.NODE_ENV === 'development'
const APP_NAME = isDevelopment ? 'mistake-trainer-dev' : 'mistake-trainer'
const APP_ID = isDevelopment ? 'com.mistake-trainer.dev' : 'com.mistake-trainer.prod'

// 设置应用 ID
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID)
}

// 使用不同的单实例锁
if (!app.requestSingleInstanceLock({
  appId: APP_ID
})) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// 初始化 store，根据环境使用不同的配置
const store = new Store({
  name: isDevelopment ? 'config-dev' : 'config',
  cwd: path.join(app.getPath('userData'), APP_NAME)
})

// 获取默认存储路径，完全分离开发和生产环境
const DEFAULT_STORAGE_PATH = isDevelopment 
  ? 'E:\\mistakes'
  : path.join(app.getPath('userData'), APP_NAME, 'storage')

// 配置文件路径也区分环境
const configPath = path.join(
  process.env.APP_ROOT || '',
  'config',
  isDevelopment ? 'training-config-dev.json' : 'training-config.json'
)

let isCancelled = false

// 获取存储路径，如果不存在则使用默认路径
let targetDirectory = store.get('storagePath') || DEFAULT_STORAGE_PATH

// 获取导出基础目录
const getExportBaseDir = () => {
  const currentMemberDir = metadataManager.getCurrentMemberDir()
  return path.join(
    currentMemberDir,
    'exports'
  )
}

// 添加临时目录配置
const getTempDirectory = () => path.join(targetDirectory, 'temp')

// 添加预览图目录配置
const getPreviewDir = () => {
  const currentMemberDir = metadataManager.getCurrentMemberDir()
  return path.join(
    currentMemberDir,
    'previews'
  )
}

// 检查路径是否存在且可写
try {
  // 确保主目录存在
  if (!fs.existsSync(targetDirectory)) {
    fs.mkdirSync(targetDirectory, { recursive: true })
  }
  fs.accessSync(targetDirectory, fs.constants.W_OK)
  
  // 确保临时目录存在
  const tempDirectory = getTempDirectory()
  if (!fs.existsSync(tempDirectory)) {
    fs.mkdirSync(tempDirectory, { recursive: true })
  }
  fs.accessSync(tempDirectory, fs.constants.W_OK)

  // 确保预览图目录存在
  if (!fs.existsSync(getPreviewDir())) {
    fs.mkdirSync(getPreviewDir(), { recursive: true })
  }
} catch (error) {
  console.error('存储路径不可用，使用默认路径:', error)
  targetDirectory = DEFAULT_STORAGE_PATH
  store.set('storagePath', DEFAULT_STORAGE_PATH)
  
  // 使用默认路径重新创建目录
  if (!fs.existsSync(targetDirectory)) {
    fs.mkdirSync(targetDirectory, { recursive: true })
  }
  const tempDirectory = getTempDirectory()
  if (!fs.existsSync(tempDirectory)) {
    fs.mkdirSync(tempDirectory, { recursive: true })
  }
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
let metadataManager = new MetadataManager(targetDirectory)

// 初始化训练管理器
const trainingManager = new TrainingManager(configPath)

// 生成预览图的函数
async function generatePreview(sourceFilePath: string, fileId: string): Promise<string> {
  const previewDir = getPreviewDir()
  // 确保预览图目录存在
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true })
  }
  const previewPath = path.join(previewDir, `${fileId}.webp`)
  
  try {
    // 获取原始图片的元数据
    const metadata = await sharp(sourceFilePath).metadata()
    
    // 根据原始图片大小计算合适的预览图尺寸
    let targetWidth = metadata.width || 0
    let targetHeight = metadata.height || 0
    
    // 设置最大尺寸限制
    const MAX_SIZE = 1200
    const MIN_SIZE = 300
    
    if (targetWidth > MAX_SIZE || targetHeight > MAX_SIZE) {
      // 如果图片太大，等比例缩小
      const ratio = Math.min(MAX_SIZE / targetWidth, MAX_SIZE / targetHeight)
      targetWidth = Math.round(targetWidth * ratio)
      targetHeight = Math.round(targetHeight * ratio)
    } else if (targetWidth < MIN_SIZE && targetHeight < MIN_SIZE) {
      // 如果图片太小，等比例放大到最小尺寸
      const ratio = Math.max(MIN_SIZE / targetWidth, MIN_SIZE / targetHeight)
      targetWidth = Math.round(targetWidth * ratio)
      targetHeight = Math.round(targetHeight * ratio)
    }

    // 生成预览图
    await sharp(sourceFilePath)
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: false  // 允许放大小图片
      })
      .webp({ 
        quality: 85,  // 提高到最高质量
        effort: 4     // 保持压缩效果和速度的平衡点
      })
      .toFile(previewPath)
    
    return previewPath
  } catch (error) {
    console.error('生成预览图失败:', error)
    throw error
  }
}

// 修改上传单个文件的函数
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
    // 先保存到临时目录
    const tempPath = path.join(getTempDirectory(), fileName)
    // 获取当前用户目录
    const currentMemberDir = metadataManager.getCurrentMemberDir()
    // 最终目标路径
    const targetPath = path.join(currentMemberDir, fileName)
    
    // 确保目标目录存在
    if (!fs.existsSync(currentMemberDir)) {
      fs.mkdirSync(currentMemberDir, { recursive: true })
    }
    
    // 复制到临时目录
    await fs.promises.copyFile(filePath, tempPath)
    
    const fileSize = fs.statSync(tempPath).size
    const chunkSize = fileSize > 1024 * 1024 * 10 ? 1024 * 500 : 1024 * 100

    // 从临时目录读取并写入目标目录
    const writeStream = fs.createWriteStream(targetPath)
    const readStream = fs.createReadStream(tempPath)
    
    let totalSize = fileSize
    let uploadedSize = 0
    
    readStream.on('data', (chunk) => {
      uploadedSize += chunk.length
      const progress = Math.round((uploadedSize / totalSize) * 100)
      
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
    
    // 删除临时文件
    await fs.promises.unlink(tempPath)
    
    // 生成预览图
    const previewPath = await generatePreview(targetPath, fileId)
    
    // 更新元数据，添加预览图路径
    await metadataManager.updateFile(fileId, {
      previewPath: path.relative(targetDirectory, previewPath)
    })

    // 发送完成状态
    event.sender.send('file:progress', {
      filePath,
      fileId,
      progress: 100,
      status: 'completed',
      fileInfo: {
        uploadDate: new Date().toISOString(),
        originalDate: fs.statSync(filePath).birthtime.toISOString()
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
    title: '错题训练',
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

// 修改文件选择处理
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

  try {
    const sourcePath = result.filePaths[0];
    const fileName = path.basename(sourcePath);
    const tempPath = path.join(getTempDirectory(), `temp-${Date.now()}-${fileName}`);
    
    // 复制到临时目录
    await fs.promises.copyFile(sourcePath, tempPath);
    
    return tempPath;
  } catch (error) {
    console.error('复制文件到临时目录失败:', error);
    throw error;
  }
})

// 修改文件预览处理
ipcMain.handle('file:preview', async (event, filePath: string) => {
  try {
    const supportedExtensions = ['jpg', 'jpeg', 'png'];
    const fileExtension = path.extname(filePath).toLowerCase().slice(1);

    if (!supportedExtensions.includes(fileExtension)) {
      throw new Error('Unsupported file type for preview.');
    }

    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    return { 
      previewUrl: `data:image/${fileExtension};base64,${base64Data}`,
      tempPath: filePath
    };
  } catch (error) {
    console.error('Error generating preview:', error);
    throw new Error('Unable to generate preview');
  }
})

// 添加清理临时文件的处理
ipcMain.handle('file:cleanup-temp', async (event, filePath?: string) => {
  try {
    if (filePath) {
      // 删除单个临时文件
      if (filePath.includes(getTempDirectory())) {
        await fs.promises.unlink(filePath);
      }
    } else {
      // 删除所有临时文件
      const tempDir = getTempDirectory();
      const files = await fs.promises.readdir(tempDir);
      await Promise.all(
        files.map(file => fs.promises.unlink(path.join(tempDir, file)))
      );
    }
    return { success: true };
  } catch (error) {
    console.error('清理临时文件失败:', error);
    return { success: false, error: error.message };
  }
})

// 修改粘贴上传处理
ipcMain.handle('file:upload-paste', async (event, data: {
  buffer: ArrayBuffer
  type: string
  name: string
}) => {
  try {
    const fileName = `temp-${Date.now()}-${data.name}`;
    const tempPath = path.join(getTempDirectory(), fileName);

    // 写入临时文件
    await fs.promises.writeFile(tempPath, Buffer.from(data.buffer));
    
    // 返回临时文件路径
    return {
      success: true,
      tempPath,
      fileName
    };
  } catch (error) {
    console.error('粘贴上传失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
})

// 修改上传处理
ipcMain.handle('file:upload', async (event, tempPaths) => {
  console.log('主进程收到上传请求,临时文件路径:', tempPaths);
  const paths = Array.isArray(tempPaths) ? tempPaths : [tempPaths];
  
  // 重置取消状态
  isAllCancelled = false;
  paths.forEach(path => cancelMap[path] = false);
  
  // 获取当前用户目录
  const currentMemberDir = metadataManager.getCurrentMemberDir()
  // 确保目标目录存在
  if (!fs.existsSync(currentMemberDir)) {
    fs.mkdirSync(currentMemberDir, { recursive: true })
  }
  
  const results = await Promise.all(
    paths.map(async tempPath => {
      try {
        // 检查文件是否在临时目录中
        if (!tempPath.includes(getTempDirectory())) {
          throw new Error('文件不在临时目录中');
        }

        const fileName = path.basename(tempPath).replace('temp-', '');
        const targetPath = path.join(currentMemberDir, fileName);
        
        // 复制到目标目录
        await fs.promises.copyFile(tempPath, targetPath);
        
        // 添加元数据
        const fileId = await metadataManager.addFile(targetPath, targetPath);
        
        // 删除临时文件
        await fs.promises.unlink(tempPath);
        
        // 生成预览图
        const previewPath = await generatePreview(targetPath, fileId);
        
        // 更新元数据，添加预览图路径
        await metadataManager.updateFile(fileId, {
          previewPath: path.relative(targetDirectory, previewPath)
        });

        // 发送完成状态
        event.sender.send('file:progress', {
          filePath: tempPath,
          fileId,
          progress: 100,
          status: 'completed',
          targetPath,
          fileInfo: {
            uploadDate: new Date().toISOString(),
            originalDate: new Date().toISOString()
          }
        });

        return {
          tempPath,
          fileId,
          success: true,
          targetPath
        };
      } catch (error) {
        console.error('上传文件失败:', error);
        event.sender.send('file:progress', {
          filePath: tempPath,
          progress: 0,
          status: 'error',
          error: error.message
        });
        return {
          tempPath,
          success: false,
          error: error.message
        };
      }
    })
  );

  const failedFiles = results.filter(result => !result.success);
  return { 
    results, 
    success: failedFiles.length === 0,
    message: failedFiles.length > 0 
      ? `${failedFiles.length} 个文件上传失败` 
      : '所有文件上传成功'
  };
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
      
      // 直接切换到新路径
      targetDirectory = newPath
      store.set('storagePath', targetDirectory)
      
      // 重新初始化 MetadataManager
      metadataManager = new MetadataManager(targetDirectory)
      
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
    // 检查当前成员目录是否存在
    const currentDir = path.join(metadataManager.getCurrentMemberDir())
    if (!fs.existsSync(currentDir)) {
      return {
        success: false,
        data: [],
        error: '存储路径不存在'
      }
    }

    // 从元数据管理器获取所有文件信息
    const metadata = await metadataManager.getMetadata()
    const allFiles = Object.entries(metadata.files)
    
    // 创建一个 Map 来存储所有文件
    const fileMap = new Map()
    
    // 处理所有文件
    for (const [id, file] of allFiles) {
      try {
        const filePath = path.join(currentDir, file.relativePath)
        let preview = ''
        
        // 获取预览图
        if (file.previewPath) {
          const previewPath = path.join(currentDir, file.previewPath)
          if (fs.existsSync(previewPath)) {
            const previewData = await fs.promises.readFile(previewPath)
            preview = `data:image/webp;base64,${previewData.toString('base64')}`
          } else {
            // 如果预览图不存在，重新生成
            const newPreviewPath = await generatePreview(filePath, id)
            const previewData = await fs.promises.readFile(newPreviewPath)
            preview = `data:image/webp;base64,${previewData.toString('base64')}`
            
            // 更新元数据中的预览图路径
            await metadataManager.updateFile(id, {
              previewPath: path.relative(currentDir, newPreviewPath)
            })
          }
        } else {
          // 如果没有预览图，生成一个
          const newPreviewPath = await generatePreview(filePath, id)
          const previewData = await fs.promises.readFile(newPreviewPath)
          preview = `data:image/webp;base64,${previewData.toString('base64')}`
          
          // 更新元数据中的预览图路径
          await metadataManager.updateFile(id, {
            previewPath: path.relative(currentDir, newPreviewPath)
          })
        }
        
        fileMap.set(id, {
          fileId: id,
          path: filePath,
          preview,
          uploadDate: file.uploadDate,
          originalDate: file.originalDate,
          originalFileName: file.originalFileName,
          fileSize: file.fileSize,
          lastModified: file.lastModified,
          hash: file.hash,
          metadata: {
            ...file,
            pairedWith: null
          }
        })
      } catch (error) {
        console.error(`处理文件 ${id} 失败:`, error)
      }
    }

    // 处理配对关系
    for (const [id, file] of allFiles) {
      if (fileMap.has(id) && file.isPaired && file.pairId) {
        const currentFile = fileMap.get(id)
        const pairedFiles = Array.from(fileMap.values()).filter(
          f => f.metadata.pairId === file.pairId && f.fileId !== id
        );
        
        if (currentFile && pairedFiles.length > 0) {
          currentFile.metadata.pairedWith = pairedFiles;
        }
      }
    }

    const validFiles = Array.from(fileMap.values())
    return {
      success: true,
      data: validFiles
    }
  } catch (error) {
    console.error('获取错题列表失败:', error)
    return {
      success: false,
      data: [],
      error: error.message
    }
  }
})

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
        currentInterval: fileMetadata.trainingInterval,
        answerTimeLimit: fileMetadata.answerTimeLimit
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

// 更新图片类
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
    console.error('获取训配置失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 更新训练配置
ipcMain.handle('config:update-training-config', async (_, config: TrainingConfig) => {
  try {
    console.log('main 进程收到配置更新请求:', config)
    
    // 验证新配置
    const isValid = trainingManager.validateConfig(config)
    console.log('配置验证结果:', isValid)
    
    if (!isValid) {
      throw new Error('配置格式无效')
    }
    
    // 保存配置到文件，使用相同的相对路径
    console.log('准备保存配置到:', configPath)
    
    // 确保配置目录存在
    const configDir = path.dirname(configPath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2))
    console.log('配置文件已保存')
    
    // 更新训练管理器中的配置
    trainingManager.updateConfig(config)
    console.log('训练管理器配置已更新')
    
    return { success: true }
  } catch (error) {
    console.error('更新训练配置失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 添加处理拖拽文件的函数
ipcMain.handle('file:handle-drop', async (event, filePath: string) => {
  try {
    const fileName = path.basename(filePath)
    const tempPath = path.join(getTempDirectory(), `temp-${Date.now()}-${fileName}`)
    
    // 复制文件到临时目录
    await fs.promises.copyFile(filePath, tempPath)
    
    return {
      success: true,
      tempPath,
      fileName
    }
  } catch (error) {
    console.error('处理拖拽文件失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 获取训练历史
ipcMain.handle('file:get-training-history', async () => {
  try {
    // 检查当前成员目录是否存在
    const currentDir = path.join(metadataManager.getCurrentMemberDir())
    if (!fs.existsSync(currentDir)) {
      return {
        success: false,
        data: [],
        error: '存储路径不存在'
      }
    }

    // 从元数据管理器获取所有文件信息
    const metadata = await metadataManager.getMetadata()
    const allFiles = Object.entries(metadata.files)
    
    // 创建一个 Map 来存储需要训练的错题
    const fileMap = new Map()
    
    // 第一步：找出所有需要训练的错题
    for (const [id, file] of allFiles) {
      try {
        // 只处理错题类型的文件
        if (file.type !== 'mistake') continue

        // 检查是否需要训练
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const nextTrainingDate = new Date(file.nextTrainingDate)
        nextTrainingDate.setHours(0, 0, 0, 0)
        
        // 只添加今天需要训练或已经逾期的错题
        if (nextTrainingDate <= today) {
          const filePath = path.join(currentDir, file.relativePath)
          let preview = ''
          
          // 获取预览图
          if (file.previewPath) {
            const previewPath = path.join(currentDir, file.previewPath)
            if (fs.existsSync(previewPath)) {
              const previewData = await fs.promises.readFile(previewPath)
              preview = `data:image/webp;base64,${previewData.toString('base64')}`
            } else {
              // 如果预览图不存在，重新生成
              const newPreviewPath = await generatePreview(filePath, id)
              const previewData = await fs.promises.readFile(newPreviewPath)
              preview = `data:image/webp;base64,${previewData.toString('base64')}`
              
              // 更新元数据中的预览图路径
              await metadataManager.updateFile(id, {
                previewPath: path.relative(currentDir, newPreviewPath)
              })
            }
          } else {
            // 如果没有预览图，生成一个
            const newPreviewPath = await generatePreview(filePath, id)
            const previewData = await fs.promises.readFile(newPreviewPath)
            preview = `data:image/webp;base64,${previewData.toString('base64')}`
            
            // 更新元数据中的预览图路径
            await metadataManager.updateFile(id, {
              previewPath: path.relative(currentDir, newPreviewPath)
            })
          }
          
          fileMap.set(id, {
            fileId: id,
            path: filePath,
            preview,
            uploadDate: file.uploadDate,
            originalDate: file.originalDate,
            originalFileName: file.originalFileName,
            fileSize: file.fileSize,
            lastModified: file.lastModified,
            hash: file.hash,
            metadata: {
              ...file,
              pairedWith: null
            }
          })
        }
      } catch (error) {
        console.error(`处理文件 ${id} 失败:`, error)
      }
    }
    
    // 第二步：为每个错题找到对应的答案
    for (const [id, file] of allFiles) {
      if (fileMap.has(id) && file.isPaired && file.pairId) {
        const currentFile = fileMap.get(id)
        const pairedAnswers = []

        // 查找所有配对的答案
        for (const [answerId, answerFile] of allFiles) {
          if (answerFile.type === 'answer' && answerFile.pairId === file.pairId) {
            try {
              const answerPath = path.join(currentDir, answerFile.relativePath)
              let answerPreview = ''
              
              // 获取答案的预览图
              if (answerFile.previewPath) {
                const previewPath = path.join(currentDir, answerFile.previewPath)
                if (fs.existsSync(previewPath)) {
                  const previewData = await fs.promises.readFile(previewPath)
                  answerPreview = `data:image/webp;base64,${previewData.toString('base64')}`
                } else {
                  // 如果预览图不存在，重新生成
                  const newPreviewPath = await generatePreview(answerPath, answerId)
                  const previewData = await fs.promises.readFile(newPreviewPath)
                  answerPreview = `data:image/webp;base64,${previewData.toString('base64')}`
                  
                  // 更新元数据中的预览图路径
                  await metadataManager.updateFile(answerId, {
                    previewPath: path.relative(currentDir, newPreviewPath)
                  })
                }
              } else {
                // 如果没有预览图，生成一个
                const newPreviewPath = await generatePreview(answerPath, answerId)
                const previewData = await fs.promises.readFile(newPreviewPath)
                answerPreview = `data:image/webp;base64,${previewData.toString('base64')}`
                
                // 更新元数据中的预览图路径
                await metadataManager.updateFile(answerId, {
                  previewPath: path.relative(currentDir, newPreviewPath)
                })
              }

              pairedAnswers.push({
                fileId: answerId,
                path: answerPath,
                preview: answerPreview,
                uploadDate: answerFile.uploadDate,
                originalDate: answerFile.originalDate,
                originalFileName: answerFile.originalFileName,
                fileSize: answerFile.fileSize,
                lastModified: answerFile.lastModified,
                hash: answerFile.hash,
                metadata: {
                  ...answerFile,
                  pairedWith: null
                }
              })
            } catch (error) {
              console.error(`处理答案文件 ${answerId} 失败:`, error)
            }
          }
        }

        // 根据答案数量设置 pairedWith
        if (pairedAnswers.length > 0) {
          currentFile.metadata.pairedWith = pairedAnswers.length === 1 ? pairedAnswers[0] : pairedAnswers
        }
      }
    }
    
    const validFiles = Array.from(fileMap.values())
    return {
      success: true,
      data: validFiles
    }
  } catch (error) {
    console.error('获取训练历史失败:', error)
    return {
      success: false,
      data: [],
      error: error.message
    }
  }
})

// 获取成员列表
ipcMain.handle('member:get-list', async () => {
  try {
    const members = await metadataManager.getMembers()
    return {
      success: true,
      data: members
    }
  } catch (error) {
    console.error('获取成员列表失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 创建新成员
ipcMain.handle('member:create', async (_, memberName: string) => {
  try {
    const success = await metadataManager.createMember(memberName)
    return {
      success,
      message: success ? '创建成功' : '创建失败'
    }
  } catch (error) {
    console.error('创建成员失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 切换成员
ipcMain.handle('member:switch', async (_, memberName: string) => {
  try {
    const success = await metadataManager.switchMember(memberName)
    return {
      success,
      message: success ? '切换成功' : '切换失败'
    }
  } catch (error) {
    console.error('切换成员失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 删除成员
ipcMain.handle('member:delete', async (_, memberName: string) => {
  try {
    const success = await metadataManager.deleteMember(memberName)
    return {
      success,
      message: success ? '删除成功' : '删除失败'
    }
  } catch (error) {
    console.error('删除成员失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 获取当前成员
ipcMain.handle('member:get-current', () => {
  return {
    success: true,
    data: metadataManager.getCurrentMember()
  }
})

// 添加文件导出处理
ipcMain.handle('file:export', async (event, filePaths: string[]) => {
  try {
    // 让用户选择导出目录
    const result = await dialog.showOpenDialog({
      title: '选择导出目录',
      properties: ['openDirectory']
    })

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: '未选择导出目录' }
    }

    const exportPath = result.filePaths[0]

    // 复制所有文件
    for (const filePath of filePaths) {
      const fileName = path.basename(filePath)
      const targetPath = path.join(exportPath, fileName)
      await fs.promises.copyFile(filePath, targetPath)
    }

    return {
      success: true,
      exportPath
    }
  } catch (error) {
    console.error('导出失败:', error)
    return {
      success: false,
      error: error.message || '导出失败'
    }
  }
})

// 添加导出训练历史的处理函数
ipcMain.handle('file:export-training-history', async (_, sortType = 'time', sortOrder = 'desc') => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择导出目录',
      properties: ['openDirectory']
    })

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: '未选择导出目录' }
    }

    const exportDir = result.filePaths[0]
    const metadata = await metadataManager.getMetadata()
    const allFiles = Object.entries(metadata.files)
    const currentDir = path.join(metadataManager.getCurrentMemberDir())
    
    // 分别存储错题和答案
    const mistakeData = []
    const answerData = []
    
    // 收集数据并筛选需要训练的错题
    for (const [id, file] of allFiles) {
      if (file.type === 'mistake') {
        // 检查是否需要训练
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const nextTrainingDate = new Date(file.nextTrainingDate)
        nextTrainingDate.setHours(0, 0, 0, 0)
        
        // 只添加今天需要训练或已经逾期的错题
        if (nextTrainingDate <= today) {
          const filePath = path.join(currentDir, file.relativePath)
          mistakeData.push({
            id,
            filePath,
            pairId: file.pairId,
            uploadDate: file.uploadDate,
            proficiency: file.proficiency || 0
          })
        }
      } else if (file.type === 'answer') {
        const filePath = path.join(currentDir, file.relativePath)
        answerData.push({
          id,
          filePath,
          pairId: file.pairId
        })
      }
    }

    // 对错题进行排序，然后反转顺序
    mistakeData.sort((a, b) => {
      if (sortType === 'time') {
        const timeA = new Date(a.uploadDate).getTime()
        const timeB = new Date(b.uploadDate).getTime()
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
      } else {
        const profA = a.proficiency
        const profB = b.proficiency
        return sortOrder === 'desc' ? profB - profA : profA - profB
      }
    }).reverse()

    // 获取当前用户名和时间戳
    const currentMember = metadataManager.getCurrentMember()
    const now = new Date()
    const dateStr = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '-')
    const timeStr = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/:/g, '-')

    const exportSubDir = path.join(exportDir, `${currentMember}_${dateStr}_${timeStr}`)
    const mistakesDir = path.join(exportSubDir, '错题')
    const answersDir = path.join(exportSubDir, '答案')
    
    fs.mkdirSync(mistakesDir, { recursive: true })
    fs.mkdirSync(answersDir, { recursive: true })

    // 按排序后的顺序处理错题
    let mistakeIndex = 1
    const mistakeMap = new Map()

    for (const item of mistakeData) {
      const extension = path.extname(item.filePath)
      const newFileName = `错题${mistakeIndex}${extension}`
      const targetPath = path.join(mistakesDir, newFileName)
      await fs.promises.copyFile(item.filePath, targetPath)
      
      if (item.pairId) {
        mistakeMap.set(item.pairId, {
          index: mistakeIndex,
          answerCount: 0
        })
      }
      mistakeIndex++
    }

    // 只处理与筛选出的错题相关的答案
    for (const item of answerData) {
      const mistakeInfo = mistakeMap.get(item.pairId)
      if (mistakeInfo) {
        const extension = path.extname(item.filePath)
        mistakeInfo.answerCount++
        const newFileName = `答案${mistakeInfo.index}-${mistakeInfo.answerCount}${extension}`
        const targetPath = path.join(answersDir, newFileName)
        await fs.promises.copyFile(item.filePath, targetPath)
      }
    }

    return {
      success: true,
      data: {
        exportDir: exportSubDir,
        mistakesCount: mistakeData.length,
        answersCount: answerData.length
      }
    }
  } catch (error) {
    console.error('导出训练历史失败:', error)
    return { success: false, error: error.message }
  }
})

// 添加文件删除处理
ipcMain.handle('file:delete', async (event, fileId: string) => {
  try {
    const metadata = await metadataManager.getMetadata()
    const fileMetadata = metadata.files[fileId]
    
    if (!fileMetadata) {
      throw new Error('文件不存在')
    }

    // 如果是配对的文件，找出所有相关的文件
    const filesToDelete = [fileId]
    if (fileMetadata.isPaired && fileMetadata.pairId) {
      // 查找所有具有相同 pairId 的文件
      for (const [id, file] of Object.entries(metadata.files)) {
        if (id !== fileId && file.pairId === fileMetadata.pairId) {
          filesToDelete.push(id)
        }
      }
    }

    // 删除所有相关文件
    for (const id of filesToDelete) {
      const file = metadata.files[id]
      if (!file) continue

      // 1. 删除实际文件
      const filePath = path.join(
        metadataManager.getCurrentMemberDir(),
        file.relativePath
      )
      
      try {
        await fs.promises.unlink(filePath)
      } catch (error) {
        console.error(`删除文件失败 (${id}):`, error)
        throw new Error(`删除文件失败 (${id}): ${error.message}`)
      }
      
      // 2. 删除元数据
      delete metadata.files[id]
    }

    // 保存更新后的元数据
    await metadataManager.saveMetadata()

    // 在删除文件时也要删除预览图
    if (fileMetadata?.previewPath) {
      const previewPath = path.join(targetDirectory, fileMetadata.previewPath)
      if (fs.existsSync(previewPath)) {
        await fs.promises.unlink(previewPath)
      }
    }

    return {
      success: true
    }
  } catch (error) {
    console.error('删除操作失败:', error)
    return {
      success: false,
      error: error.message || '删除失败'
    }
  }
})

// 更新元数据细节
ipcMain.handle('metadata:update-details', async (_, fileId: string, answerTimeLimit: number) => {
  try {
    const metadata = await metadataManager.getMetadata()
    if (metadata.files[fileId]) {
      metadata.files[fileId].answerTimeLimit = answerTimeLimit
      await metadataManager.saveMetadata(metadata)
      return { success: true }
    }
    return { success: false, error: '文件不存在' }
  } catch (error) {
    console.error('更新答题时限失败:', error)
    return { success: false, error: '更新答题时限失败' }
  }
})

// 添加导出错题的处理函数
ipcMain.handle('file:export-mistake', async (_, params: {
  mistake: MistakeItem
  answer: MistakeItem | MistakeItem[] | null
  exportTime: string
  exportType: 'selected' | 'training'
}) => {
  try {
    const exportBaseDir = getExportBaseDir()
    const today = new Date()
    const dateStr = today.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '-')
    
    const exportDir = path.join(exportBaseDir, dateStr)
    fs.mkdirSync(exportDir, { recursive: true })
    
    const mistakesDir = path.join(exportDir, '错题')
    const answersDir = path.join(exportDir, '答案')
    const metadataDir = path.join(exportDir, 'metadata')
    const previewsDir = path.join(exportDir, 'previews')
    
    fs.mkdirSync(mistakesDir, { recursive: true })
    fs.mkdirSync(answersDir, { recursive: true })
    fs.mkdirSync(metadataDir, { recursive: true })
    fs.mkdirSync(previewsDir, { recursive: true })

    // 获取当前目录下已存在的错题数量，用于生成新的序号
    const existingMistakes = fs.readdirSync(mistakesDir)
    const mistakeNumber = existingMistakes.length + 1

    // 生成错题文件名：序号 + 原始扩展名
    const mistakeExt = path.extname(params.mistake.path)
    const mistakeFileName = `错题${mistakeNumber}${mistakeExt}`
    const mistakeTargetPath = path.join(mistakesDir, mistakeFileName)
    await fs.promises.copyFile(params.mistake.path, mistakeTargetPath)

    // 生成错题预览图
    const mistakePreviewPath = path.join(previewsDir, `错题${mistakeNumber}.webp`)
    await sharp(params.mistake.path)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: false
      })
      .webp({ 
        quality: 85,
        effort: 4
      })
      .toFile(mistakePreviewPath)

    // 保存错题的元数据
    const mistakeMetadata = {
      originalFileId: params.mistake.fileId,
      exportDate: today.toISOString(),
      exportType: params.exportType,
      metadata: params.mistake.metadata,
      previewPath: path.relative(exportDir, mistakePreviewPath)
    }
    await fs.promises.writeFile(
      path.join(metadataDir, `错题${mistakeNumber}.json`),
      JSON.stringify(mistakeMetadata, null, 2)
    )

    // 准备返回的路径信息
    const exportInfo = {
      mistake: {
        path: mistakeTargetPath,
        preview: mistakePreviewPath,
        metadata: params.mistake.metadata
      },
      answer: null as any
    }

    // 如果有答案，使用对应的命名方式
    if (params.answer) {
      const answers = Array.isArray(params.answer) ? params.answer : [params.answer]
      const answerPaths = []
      
      for (let i = 0; i < answers.length; i++) {
        const answer = answers[i]
        const answerExt = path.extname(answer.path)
        // 生成答案文件名：错题序号.答案序号 + 原始扩展名
        const answerFileName = `${mistakeNumber}.${i + 1}${answerExt}`
        const answerTargetPath = path.join(answersDir, answerFileName)
        await fs.promises.copyFile(answer.path, answerTargetPath)

        // 生成答案预览图
        const answerPreviewPath = path.join(previewsDir, `答案${mistakeNumber}.${i + 1}.webp`)
        await sharp(answer.path)
          .resize(800, 800, {
            fit: 'inside',
            withoutEnlargement: false
          })
          .webp({ 
            quality: 85,
            effort: 4
          })
          .toFile(answerPreviewPath)

        // 保存答案的元数据
        const answerMetadata = {
          originalFileId: answer.fileId,
          exportDate: today.toISOString(),
          exportType: params.exportType,
          metadata: answer.metadata,
          previewPath: path.relative(exportDir, answerPreviewPath)
        }
        await fs.promises.writeFile(
          path.join(metadataDir, `答案${mistakeNumber}.${i + 1}.json`),
          JSON.stringify(answerMetadata, null, 2)
        )

        answerPaths.push({
          path: answerTargetPath,
          preview: answerPreviewPath,
          metadata: answer.metadata
        })
      }

      // 如果只有一个答案，直接赋值；如果有多个，返回数组
      exportInfo.answer = answerPaths.length === 1 ? answerPaths[0] : answerPaths
    }

    return {
      success: true,
      data: {
        exportPath: exportDir,
        exportInfo
      }
    }
  } catch (error) {
    console.error('导出错题失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 添加获取错题详情的处理函数
ipcMain.handle('file:get-mistake-details', async (_, fileId: string) => {
  try {
    const currentDir = path.join(metadataManager.getCurrentMemberDir())
    const metadata = await metadataManager.getMetadata()
    const file = metadata.files[fileId]
    
    if (!file) {
      return { success: false, error: '文件不存在' }
    }

    const filePath = path.join(currentDir, file.relativePath)
    const fileData = await fs.promises.readFile(filePath)
    const fileExtension = path.extname(filePath).toLowerCase().slice(1)
    const base64Data = fileData.toString('base64')
    
    // 构建错题数据
    const mistakeData = {
      fileId,
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
        pairedWith: null
      }
    }

    // 如果有配对的答案，获取答案信息
    if (file.isPaired && file.pairId) {
      const pairedAnswers = Object.entries(metadata.files)
        .filter(([_, f]) => f.type === 'answer' && f.pairId === file.pairId)
        .map(([id, f]) => {
          const answerPath = path.join(currentDir, f.relativePath)
          const answerData = fs.readFileSync(answerPath)
          const answerExtension = path.extname(answerPath).toLowerCase().slice(1)
          const answerBase64 = answerData.toString('base64')
          
          return {
            fileId: id,
            path: answerPath,
            preview: `data:image/${answerExtension};base64,${answerBase64}`,
            uploadDate: f.uploadDate,
            originalDate: f.originalDate,
            originalFileName: f.originalFileName,
            fileSize: f.fileSize,
            lastModified: f.lastModified,
            hash: f.hash,
            metadata: {
              ...f,
              pairedWith: null
            }
          }
        })

      if (pairedAnswers.length > 0) {
        mistakeData.metadata.pairedWith = pairedAnswers.length === 1 ? pairedAnswers[0] : pairedAnswers
      }
    }

    return {
      success: true,
      data: mistakeData
    }
  } catch (error) {
    console.error('获取错题详情失败:', error)
    return { success: false, error: error.message }
  }
})

// 添加获取导出错题记录的处理函数
ipcMain.handle('file:get-exported-mistakes', async () => {
  try {
    const exportBaseDir = getExportBaseDir()
    const result: {
      date: string
      path: string
      mistakes: {
        path: string
        preview: string
        originalFileId?: string
        exportType: 'selected' | 'training'
        metadata?: any
        answers: Array<{
          path: string
          preview: string
          originalFileId?: string
          metadata?: any
        }>
      }[]
    }[] = []

    // 检查导出目录是否存在
    if (!fs.existsSync(exportBaseDir)) {
      return { success: true, data: [] }
    }

    // 获取所有日期文件夹
    const dateDirs = fs.readdirSync(exportBaseDir)
    
    for (const dateDir of dateDirs) {
      const datePath = path.join(exportBaseDir, dateDir)
      const mistakesDir = path.join(datePath, '错题')
      const answersDir = path.join(datePath, '答案')
      const metadataDir = path.join(datePath, 'metadata')
      const previewsDir = path.join(datePath, 'previews')
      
      if (!fs.existsSync(mistakesDir) || !fs.existsSync(answersDir)) {
        continue
      }

      const mistakes = fs.readdirSync(mistakesDir)
      const dateItem = {
        date: dateDir,
        path: datePath,
        mistakes: [] as typeof result[0]['mistakes']
      }

      for (const mistake of mistakes) {
        const mistakePath = path.join(mistakesDir, mistake)
        const mistakeNumber = path.parse(mistake).name.replace(/^错题/, '')
        
        // 获取错题元数据
        let mistakeMetadata = null
        try {
          const metadataPath = path.join(metadataDir, `错题${mistakeNumber}.json`)
          if (fs.existsSync(metadataPath)) {
            const metadataContent = await fs.promises.readFile(metadataPath, 'utf-8')
            mistakeMetadata = JSON.parse(metadataContent)
          }
        } catch (error) {
          console.error('读取错题元数据失败:', error)
        }
        
        // 获取预览图
        let preview = ''
        try {
          if (mistakeMetadata?.previewPath) {
            const previewPath = path.join(datePath, mistakeMetadata.previewPath)
            if (fs.existsSync(previewPath)) {
              const previewData = await fs.promises.readFile(previewPath)
              preview = `data:image/webp;base64,${previewData.toString('base64')}`
            }
          }
          
          // 如果没有预览图或预览图不存在，生成一个新的
          if (!preview) {
            const previewPath = path.join(previewsDir, `错题${mistakeNumber}.webp`)
            await sharp(mistakePath)
              .resize(800, 800, {
                fit: 'inside',
                withoutEnlargement: false
              })
              .webp({ 
                quality: 85,
                effort: 4
              })
              .toFile(previewPath)
            
            const previewData = await fs.promises.readFile(previewPath)
            preview = `data:image/webp;base64,${previewData.toString('base64')}`
            
            // 更新元数据中的预览图路径
            if (mistakeMetadata) {
              mistakeMetadata.previewPath = path.relative(datePath, previewPath)
              await fs.promises.writeFile(
                path.join(metadataDir, `错题${mistakeNumber}.json`),
                JSON.stringify(mistakeMetadata, null, 2)
              )
            }
          }
        } catch (error) {
          console.error('处理预览图失败:', error)
        }
        
        // 获取对应的答案
        const answerPattern = new RegExp(`^${mistakeNumber}\\.`)
        const answers = fs.readdirSync(answersDir)
          .filter(file => answerPattern.test(file))
          .map(async file => {
            const answerPath = path.join(answersDir, file)
            
            // 获取答案元数据
            let answerMetadata = null
            try {
              const metadataPath = path.join(metadataDir, `答案${file}.json`)
              if (fs.existsSync(metadataPath)) {
                const metadataContent = await fs.promises.readFile(metadataPath, 'utf-8')
                answerMetadata = JSON.parse(metadataContent)
              }
            } catch (error) {
              console.error('读取答案元数据失败:', error)
            }
            
            // 获取答案预览图
            let answerPreview = ''
            try {
              if (answerMetadata?.previewPath) {
                const previewPath = path.join(datePath, answerMetadata.previewPath)
                if (fs.existsSync(previewPath)) {
                  const previewData = await fs.promises.readFile(previewPath)
                  answerPreview = `data:image/webp;base64,${previewData.toString('base64')}`
                }
              }
              
              // 如果没有预览图或预览图不存在，生成一个新的
              if (!answerPreview) {
                const previewPath = path.join(previewsDir, `答案${file}.webp`)
                await sharp(answerPath)
                  .resize(800, 800, {
                    fit: 'inside',
                    withoutEnlargement: false
                  })
                  .webp({ 
                    quality: 85,
                    effort: 4
                  })
                  .toFile(previewPath)
                
                const previewData = await fs.promises.readFile(previewPath)
                answerPreview = `data:image/webp;base64,${previewData.toString('base64')}`
                
                // 更新元数据中的预览图路径
                if (answerMetadata) {
                  answerMetadata.previewPath = path.relative(datePath, previewPath)
                  await fs.promises.writeFile(
                    path.join(metadataDir, `答案${file}.json`),
                    JSON.stringify(answerMetadata, null, 2)
                  )
                }
              }
            } catch (error) {
              console.error('处理答案预览图失败:', error)
            }
            
            return {
              path: answerPath,
              preview: answerPreview,
              originalFileId: answerMetadata?.originalFileId,
              metadata: answerMetadata?.metadata
            }
          })

        dateItem.mistakes.push({
          path: mistakePath,
          preview,
          originalFileId: mistakeMetadata?.originalFileId,
          exportType: mistakeMetadata?.exportType,
          metadata: mistakeMetadata?.metadata,
          answers: await Promise.all(answers)
        })
      }

      result.push(dateItem)
    }

    // 按日期倒序排序
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return { success: true, data: result }
  } catch (error) {
    console.error('获取导出记录失败:', error)
    return { success: false, error: error.message }
  }
})

// 添加删除导出记录的处理函数
ipcMain.handle('file:delete-exported-mistakes', async (_, date: string) => {
  try {
    const exportBaseDir = getExportBaseDir()
    const datePath = path.join(exportBaseDir, date)
    
    if (fs.existsSync(datePath)) {
      await fs.promises.rm(datePath, { recursive: true })
      return { success: true }
    }
    
    return { success: false, error: '目录不存在' }
  } catch (error) {
    console.error('删除导出记录失败:', error)
    return { success: false, error: error.message }
  }
})

// 添加导出到 Word 的处理函数
ipcMain.handle('file:export-to-word', async (_, items: Array<{
  mistake: {
    path: string
    metadata?: any
  }
  answer?: {
    path: string
    metadata?: any
  }
}>) => {
  try {
    // 让用户选择保存位置
    const result = await dialog.showSaveDialog({
      title: '保存 Word 文档',
      defaultPath: `错题集_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.docx`,
      filters: [
        { name: 'Word 文档', extensions: ['docx'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: '未选择保存位置' }
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "错题集",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER
          })
        ]
      }]
    })

    // 添加每个错题和答案
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      // 获取图片的实际尺寸
      const mistakeImageBuffer = fs.readFileSync(item.mistake.path)
      
      // 添加错题标题和图片
      doc.addSection({
        children: [
          new Paragraph({
            text: `错题 ${i + 1}`,
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: mistakeImageBuffer,
                transformation: {
                  width: 600,
                  height: 0 // 设置为0让图片保持原始比例
                }
              })
            ]
          })
        ]
      })

      // 如果有答案，添加答案
      if (item.answer) {
        const answerImageBuffer = fs.readFileSync(item.answer.path)
        doc.addSection({
          children: [
            new Paragraph({
              text: `答案 ${i + 1}`,
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph({
              children: [
                new ImageRun({
                  data: answerImageBuffer,
                  transformation: {
                    width: 600,
                    height: 0 // 设置为0让图片保持原始比例
                  }
                })
              ]
            })
          ]
        })
      }
    }

    // 保存文档
    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(result.filePath, buffer)

    return {
      success: true,
      data: {
        filePath: result.filePath
      }
    }
  } catch (error) {
    console.error('导出到 Word 失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// 添加冻结状态相关的 IPC 处理器
ipcMain.handle('setFrozen', async (event, fileId: string, isFrozen: boolean) => {
  try {
    const result = await metadataManager.setFrozen(fileId, isFrozen)
    return { success: result }
  } catch (error) {
    console.error('设置冻结状态失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('getFrozen', (event, fileId: string) => {
  try {
    const isFrozen = metadataManager.getFrozen(fileId)
    return { success: true, isFrozen }
  } catch (error) {
    console.error('获取冻结状态失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('setMultipleFrozen', async (event, fileIds: string[], isFrozen: boolean) => {
  try {
    const result = await metadataManager.setMultipleFrozen(fileIds, isFrozen)
    return { success: result }
  } catch (error) {
    console.error('批量设置冻结状态失败:', error)
    return { success: false, error: error.message }
  }
})

// 添加设置训练日期的处理器
ipcMain.handle('metadata:set-next-training-date', async (_, fileId: string, nextTrainingDate: string) => {
  try {
    const metadata = await metadataManager.getMetadata()
    const fileMetadata = metadata.files[fileId]
    
    if (!fileMetadata) {
      throw new Error('文件不存在')
    }

    // 直接设置下次训练日期
    fileMetadata.nextTrainingDate = nextTrainingDate
    await metadataManager.saveMetadata()

    return {
      success: true,
      data: fileMetadata
    }
  } catch (error) {
    console.error('设置训练日期失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
})
