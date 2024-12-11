import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

const METADATA_FILE = '.metadata.json'

export class MetadataManager {
  private metadataPath: string
  private baseDir: string
  private metadata: MetadataStore

  constructor(storageDir: string) {
    this.baseDir = storageDir
    this.metadataPath = path.join(storageDir, METADATA_FILE)
    this.metadata = {
      version: '1.0',
      baseDir: storageDir,
      files: {}
    }
    this.loadMetadata()
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

  async addFile(originalPath: string, targetPath: string) {
    const id = uuidv4()
    const relativePath = path.relative(this.baseDir, targetPath)
    const fileStats = fs.statSync(originalPath)
    
    // 计算文件哈希
    const hash = await this.calculateFileHash(originalPath)
    
    this.metadata.files[id] = {
      id,
      relativePath,
      originalFileName: path.basename(originalPath),
      uploadDate: new Date().toISOString(),
      originalDate: fileStats.birthtime.toISOString(),
      fileSize: fileStats.size,
      lastModified: fileStats.mtime.toISOString(),
      hash
    }
    
    this.saveMetadata()
    return id
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
} 