/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: {
    on(channel: string, func: (...args: any[]) => void): void
    off(channel: string, func: (...args: any[]) => void): void
    send(channel: string, ...args: any[]): void
    invoke(channel: string, ...args: any[]): Promise<any>
    
    mistake: {
      getMistakes: () => Promise<Result<MistakeItem[]>>
      getTrainingHistory: () => Promise<Result<MistakeItem[]>>
    }

    metadata: {
      updateType: (fileId: string, type: 'mistake' | 'answer') => Promise<Result>
      pairImages: (fileId1: string, fileId2: string) => Promise<Result>
      unpairImages: (fileId1: string, fileId2: string) => Promise<Result>
      updateDetails: (fileId: string, answerTimeLimit: number) => Promise<Result>
      setNextTrainingDate: (fileId: string, nextTrainingDate: string) => Promise<Result>
    }

    file: {
      export: (paths: string[]) => Promise<{
        success: boolean
        exportPath?: string
        error?: string
      }>
      delete: (fileId: string) => Promise<{
        success: boolean
        error?: string
      }>
    }
  }
}

interface Result<T = any> {
  success: boolean
  data?: T
  error?: string
}
