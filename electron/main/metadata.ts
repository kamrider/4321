import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { app } from 'electron'

const METADATA_FILE = '.metadata.json'

export class MetadataManager {
  private baseDir: string | null = null
  private metadataPath: string | null = null
  private metadata: MetadataStore | null = null

  constructor(initialPath: string | null = null) {
    if (initialPath) {
      this.setUserStoragePath(initialPath)
    }
  }

  setUserStoragePath(userId: string) {
    const userDir = path.join(app.getPath('userData'), 'users', userId)
    this.baseDir = path.join(userDir, 'images')
    this.metadataPath = path.join(userDir, 'metadata.json')
    this.loadMetadata()
  }

  private createDefaultStore(baseDir: string): MetadataStore {
    return {
      version: '1.1',
      baseDir,
      files: {}
    }
  }

  private createDefaultMetadata(
    originalPath: string, 
    targetPath: string, 
    stats: fs.Stats, 
    hash: string
  ): FileMetadata {
    const now = new Date()
    const defaultTrainingInterval = 1
    const nextTrainingDate = new Date(now)
    nextTrainingDate.setDate(now.getDate() + defaultTrainingInterval)

    return {
      id: uuidv4(),
      relativePath: path.relative(this.baseDir, targetPath),
      originalFileName: path.basename(originalPath),
      uploadDate: now.toISOString(),
      originalDate: stats.birthtime.toISOString(),
      fileSize: stats.size,
      lastModified: stats.mtime.toISOString(),
      hash,
      proficiency: 0,
      trainingInterval: defaultTrainingInterval,
      lastTrainingDate: now.toISOString(),
      nextTrainingDate: nextTrainingDate.toISOString(),
      subject: '',
      tags: ['未分类'],
      trainingRecords: [],
    }
  }

  async addFile(originalPath: string, targetPath: string): Promise<string | null> {
    try {
      if (!fs.existsSync(originalPath)) {
        throw new Error(`原始文件不存在: ${originalPath}`)
      }

      const fileStats = fs.statSync(originalPath)
      const hash = await this.calculateFileHash(originalPath)
      
      // 检查是否存在相同 hash 的文件
      const existingFile = Object.values(this.metadata.files).find(file => file.hash === hash)
      if (existingFile) {
        throw new Error(`文件已存在: ${existingFile.originalFileName}`)
      }

      const metadata = this.createDefaultMetadata(originalPath, targetPath, fileStats, hash)
      
      this.metadata.files[metadata.id] = metadata
      await this.saveMetadata()
      
      return metadata.id

    } catch (error) {
      console.error(`添加文件失败 (${originalPath}):`, error)
      return null
    }
  }

  private async upgradeMetadata() {
    try {
      if (this.metadata.version === '1.0') {
        console.log('开始升级元数据从 1.0 到 1.1...')
        for (const [id, file] of Object.entries(this.metadata.files)) {
          if (!file.proficiency) {
            const now = new Date()
            const nextDate = new Date(now)
            nextDate.setDate(now.getDate() + 1)

            Object.assign(file, {
              proficiency: 0,
              trainingInterval: 1,
              lastTrainingDate: file.uploadDate,
              nextTrainingDate: nextDate.toISOString(),
              subject: '',
              tags: ['未分类']
            })
          }
        }
        this.metadata.version = '1.1'
        await this.saveMetadata()
        console.log('元数据升级完成')
      }
    } catch (error) {
      console.error(`升级元数据失败 (版本 ${this.metadata.version}):`, error)
    }
  }

  private loadMetadata() {
    try {
      if (fs.existsSync(this.metadataPath)) {
        const data = fs.readFileSync(this.metadataPath, 'utf-8')
        const parsed = JSON.parse(data)
        // 更新基础目录为当前目录
        parsed.baseDir = this.baseDir
        this.metadata = parsed
      }
    } catch (error) {
      console.error('加载元数据失败:', error)
      this.metadata = {
        version: '1.0',
        baseDir: this.baseDir,
        files: {}
      }
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      
      stream.on('data', data => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  private saveMetadata() {
    try {
      fs.writeFileSync(this.metadataPath, JSON.stringify(this.metadata, null, 2))
    } catch (error) {
      console.error('保存元数据失败:', error)
    }
  }

  validateMetadata() {
    const validFiles: typeof this.metadata.files = {}
    
    for (const [id, metadata] of Object.entries(this.metadata.files)) {
      const fullPath = path.join(this.baseDir, metadata.relativePath)
      try {
        if (fs.existsSync(fullPath)) {
          validFiles[id] = metadata
        } else {
          console.warn(`文件不存在: ${fullPath}, ID: ${id}`)
        }
      } catch (error) {
        console.error(`验证文件失败 ID ${id}:`, error)
      }
    }
    
    this.metadata.files = validFiles
    this.saveMetadata()
  }

  async migrateStorage(newPath: string): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = []
    const oldPath = this.baseDir
    const oldMetadataPath = this.metadataPath

    try {
      await fs.promises.mkdir(newPath, { recursive: true })
      
      // 先复制元数据文件到新路径
      const newMetadataPath = path.join(newPath, METADATA_FILE)
      await fs.promises.copyFile(oldMetadataPath, newMetadataPath)
      
      // 开始迁移文件
      for (const [id, metadata] of Object.entries(this.metadata.files)) {
        const oldFilePath = path.join(oldPath, metadata.relativePath)
        const newFilePath = path.join(newPath, metadata.relativePath)
        
        try {
          await fs.promises.mkdir(path.dirname(newFilePath), { recursive: true })
          await fs.promises.copyFile(oldFilePath, newFilePath)
          
          // 验证新文件
          const oldHash = await this.calculateFileHash(oldFilePath)
          const newHash = await this.calculateFileHash(newFilePath)
          
          if (oldHash === newHash) {
            // 迁移成功，删除旧文件
            await fs.promises.unlink(oldFilePath)
          } else {
            throw new Error('文件验证失败')
          }
        } catch (error) {
          errors.push(`文件 ${metadata.originalFileName} 迁移失败: ${error.message}`)
        }
      }

      if (errors.length === 0) {
        // 更新实例变量
        this.baseDir = newPath
        this.metadataPath = newMetadataPath
        this.metadata.baseDir = newPath
        await this.saveMetadata()
        
        // 删除旧的元数据文件
        await fs.promises.unlink(oldMetadataPath)
      } else {
        // 如果有错误，删除新的元数据文件
        await fs.promises.unlink(newMetadataPath)
      }

      return { success: errors.length === 0, errors }
    } catch (error) {
      // 如果发生错误，确保删除新的元数据文件
      const newMetadataPath = path.join(newPath, METADATA_FILE)
      if (fs.existsSync(newMetadataPath)) {
        await fs.promises.unlink(newMetadataPath)
      }
      return { success: false, errors: [...errors, error.message] }
    }
  }

  async getMetadata(): Promise<MetadataStore> {
    // 在返回之前验证一下元数据
    this.validateMetadata()
    return this.metadata
  }
} 