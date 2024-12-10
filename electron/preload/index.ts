import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
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

  // 添加文件操作相关的方法
  uploadFile: {
    // 选择文件
    select: async () => {
      try {
        return await ipcRenderer.invoke('file:select');
      } catch (error) {
        console.error('Error selecting file:', error);
        throw error;
      }
    },
    
    // 开始上传文件
    start: (filePath: string) => {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid filePath provided for upload.');
      }
      return ipcRenderer.invoke('file:upload', filePath);
    },
    
    // 获取上传进度
    onProgress: (callback: (progress: UploadProgress) => void) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('file:progress', listener);
      return () => ipcRenderer.removeListener('file:progress', listener);
    },
    
    // 取消上传
    cancel: async () => {
      try {
        const result = await ipcRenderer.invoke('file:cancel');
        return { success: true, result };
      } catch (error) {
        console.error('Error canceling upload:', error);
        return { success: false, error };
      }
    },
    
    // 获取文件预览
    getPreview: async (filePath: string) => {
      try {
        return await ipcRenderer.invoke('file:preview', filePath);
      } catch (error) {
        console.error('Error getting file preview:', error);
        throw error;
      }
    },

    // 获取存储路径
    getStoragePath: async () => {
      try {
        return await ipcRenderer.invoke('file:get-storage-path');
      } catch (error) {
        console.error('Error getting storage path:', error);
        throw error;
      }
    },

    // 设置存储路径
    setStoragePath: async () => {
      try {
        return await ipcRenderer.invoke('file:set-storage-path');
      } catch (error) {
        console.error('Error setting storage path:', error);
        throw error;
      }
    },

    // 重置存储路径
    resetStoragePath: async () => {
      try {
        return await ipcRenderer.invoke('file:reset-storage-path');
      } catch (error) {
        console.error('Error resetting storage path:', error);
        throw error;
      }
    }
  }

  // You can expose other APTs you need here.
  // ...
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
