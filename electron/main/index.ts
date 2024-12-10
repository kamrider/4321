import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import * as fs from 'fs'
import Store from 'electron-store'

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

ipcMain.handle('file:upload', async (event, filePath) => {
  try {
    isCancelled = false;
    
    // 确保目标目录存在
    if (!fs.existsSync(targetDirectory)) {
      fs.mkdirSync(targetDirectory, { recursive: true });
    }

    const fileName = path.basename(filePath);
    const targetPath = path.join(targetDirectory, fileName);
    
    const fileSize = fs.statSync(filePath).size;
    const chunkSize = 1024 * 100;
    let uploadedSize = 0;

    const readStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
    const writeStream = fs.createWriteStream(targetPath);

    for await (const chunk of readStream) {
      if (isCancelled) {
        readStream.destroy();
        writeStream.destroy();
        fs.unlinkSync(targetPath); // 删除未完成的文件
        event.sender.send('file:progress', { progress: 0, status: 'cancelled' });
        return { success: false, message: 'Upload cancelled' };
      }

      writeStream.write(chunk);
      uploadedSize += chunk.length;
      
      const progress = Math.min((uploadedSize / fileSize) * 100, 100).toFixed(2);
      event.sender.send('file:progress', { 
        progress: parseFloat(progress), 
        status: 'uploading',
        targetPath 
      });
      
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    writeStream.end();
    
    return { 
      success: true, 
      targetPath,
      message: `文件已保存至: ${targetPath}` 
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
})

ipcMain.handle('file:cancel', () => {
  isCancelled = true;
  return { cancelled: true };
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
ipcMain.handle('file:set-storage-path', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择文件存储位置'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0];
    try {
      // 验证路径是否可写
      fs.accessSync(newPath, fs.constants.W_OK);
      targetDirectory = newPath;
      store.set('storagePath', targetDirectory);
      return targetDirectory;
    } catch (error) {
      throw new Error('选定路径不可写，请选择其他路径');
    }
  }
  return null;
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
