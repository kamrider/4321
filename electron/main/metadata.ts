import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

const METADATA_FILE = '.metadata.json'

export class MetadataManager {
  private metadataPath: string
  private baseDir: string
  private metadata: MetadataStore
  private membersDir: string
  private currentMember: string | null = null

  constructor(storageDir: string) {
    this.baseDir = storageDir
    this.membersDir = path.join(storageDir, 'members')
    this.metadataPath = path.join(storageDir, METADATA_FILE)
    this.metadata = this.createDefaultStore(storageDir)
    this.loadMetadata()
    this.initializeMembersDirectory()
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
      type: 'mistake',
      pairId: null,
      isPaired: false,
      answerTimeLimit: 300
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

  private async migrateMetadata() {
    let hasChanges = false
    
    // 遍历所有文件元数据
    for (const fileId in this.metadata.files) {
      const file = this.metadata.files[fileId]
      
      // 如果没有 answerTimeLimit 字段，添加默认值（5分钟 = 300秒）
      if (file.answerTimeLimit === undefined) {
        file.answerTimeLimit = 300
        hasChanges = true
      }
    }

    // 如果有更改，保存元数据
    if (hasChanges) {
      await this.saveMetadata()
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
        
        // 在加载后立即进行迁移
        this.migrateMetadata()
      } else {
        // 如果元数据文件不存在，创建一个新的
        this.metadata = this.createDefaultStore(this.baseDir)
        this.saveMetadata()
        
        // 在创建新元数据后也进行迁移
        this.migrateMetadata()
      }
    } catch (error) {
      console.error('加载元数据失败:', error)
      this.metadata = {
        version: '1.0',
        baseDir: this.baseDir,
        files: {}
      }
      
      // 在创建新元数据后也进行迁移
      this.migrateMetadata()
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
    const newMetadataPath = path.join(newPath, METADATA_FILE)

    try {
      await fs.promises.mkdir(newPath, { recursive: true })
      
      // 检查新路径是否已经存在 metadata 文件
      let existingMetadata: MetadataStore | null = null
      if (fs.existsSync(newMetadataPath)) {
        try {
          const existingData = await fs.promises.readFile(newMetadataPath, 'utf-8')
          existingMetadata = JSON.parse(existingData)
          console.log('发现目标路径已有 metadata:', existingMetadata)
        } catch (error) {
          console.error('读取目标路径 metadata 失败:', error)
          errors.push(`读取目标路径 metadata 失败: ${error.message}`)
        }
      }
      
      // 如果存在有效的 metadata，合并它
      if (existingMetadata?.files) {
        // 合并文件记录
        for (const [id, file] of Object.entries(existingMetadata.files)) {
          // 检查文件是否真实存在
          const filePath = path.join(newPath, file.relativePath)
          if (fs.existsSync(filePath)) {
            // 如果文件 ID 已存在，生成新的 ID
            let newId = id
            while (this.metadata.files[newId]) {
              newId = uuidv4()
            }
            this.metadata.files[newId] = {
              ...file,
              id: newId,
              relativePath: file.relativePath
            }
          }
        }
      }
      
      // 复制当前文件到新路径
      for (const [id, metadata] of Object.entries(this.metadata.files)) {
        const oldFilePath = path.join(oldPath, metadata.relativePath)
        const newFilePath = path.join(newPath, metadata.relativePath)
        
        try {
          // 确保目标目录存在
          await fs.promises.mkdir(path.dirname(newFilePath), { recursive: true })
          
          // 如果文件在源路径存在，才进行复制
          if (fs.existsSync(oldFilePath)) {
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
        if (fs.existsSync(oldMetadataPath)) {
          await fs.promises.unlink(oldMetadataPath)
        }
      } else {
        // 如果有错误，删除新的元数据文件
        if (fs.existsSync(newMetadataPath)) {
          await fs.promises.unlink(newMetadataPath)
        }
      }

      return { success: errors.length === 0, errors }
    } catch (error) {
      // 如果发生错误，确保删除新的元数据文件
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

  private async initializeMembersDirectory() {
    // 确保 members 目录存在
    if (!fs.existsSync(this.membersDir)) {
      await fs.promises.mkdir(this.membersDir, { recursive: true })
    }

    // 如果没有成员，创建默认成员
    const members = await this.getMembers()
    if (members.length === 0) {
      await this.createMember('default')
    }

    // 如果没有当前成员，设置为第一个成员
    if (!this.currentMember) {
      const members = await this.getMembers()
      if (members.length > 0) {
        await this.switchMember(members[0])
      }
    }
  }

  // 获取所有成员列表
  async getMembers(): Promise<string[]> {
    try {
      const items = await fs.promises.readdir(this.membersDir, { withFileTypes: true })
      return items
        .filter(item => item.isDirectory())
        .map(item => item.name)
    } catch (error) {
      console.error('获取成员列表失败:', error)
      return []
    }
  }

  // 创建新成员
  async createMember(memberName: string): Promise<boolean> {
    try {
      const memberDir = path.join(this.membersDir, memberName)
      const memberFilesDir = path.join(memberDir, 'files')
      const memberExamsDir = path.join(memberDir, 'exams')
      
      // 检查成员是否已存在
      if (fs.existsSync(memberDir)) {
        throw new Error(`成员 ${memberName} 已存在`)
      }

      // 创建成员目录结构
      await fs.promises.mkdir(memberDir, { recursive: true })
      await fs.promises.mkdir(memberFilesDir, { recursive: true })
      await fs.promises.mkdir(memberExamsDir, { recursive: true })
      await fs.promises.mkdir(path.join(memberExamsDir, 'ongoing'), { recursive: true })
      await fs.promises.mkdir(path.join(memberExamsDir, 'completed'), { recursive: true })
      
      // 创建成员的 metadata 文件
      const memberMetadataPath = path.join(memberDir, METADATA_FILE)
      const initialMetadata = this.createDefaultStore(memberFilesDir)
      await fs.promises.writeFile(
        memberMetadataPath,
        JSON.stringify(initialMetadata, null, 2)
      )

      return true
    } catch (error) {
      console.error(`创建成员 ${memberName} 失败:`, error)
      return false
    }
  }

  // 切换到指定成员
  async switchMember(memberName: string): Promise<boolean> {
    try {
      const memberDir = path.join(this.membersDir, memberName)
      const memberFilesDir = path.join(memberDir, 'files')
      const memberMetadataPath = path.join(memberDir, METADATA_FILE)

      // 检查成员是否存在
      if (!fs.existsSync(memberDir)) {
        throw new Error(`成员 ${memberName} 不存在`)
      }

      // 更新当前路径
      this.currentMember = memberName
      this.baseDir = memberFilesDir
      this.metadataPath = memberMetadataPath
      
      // 加载新的 metadata
      this.loadMetadata()

      // 保存当前成员到配置文件
      const currentMemberPath = path.join(this.membersDir, 'current.txt')
      await fs.promises.writeFile(currentMemberPath, memberName, 'utf-8')

      return true
    } catch (error) {
      console.error(`切换到成员 ${memberName} 失败:`, error)
      return false
    }
  }

  // 删除成员
  async deleteMember(memberName: string): Promise<boolean> {
    try {
      // 不允许删除当前成员
      if (memberName === this.currentMember) {
        throw new Error('不能删除当前使用的成员')
      }

      const memberDir = path.join(this.membersDir, memberName)
      
      // 检查成员是否存在
      if (!fs.existsSync(memberDir)) {
        throw new Error(`成员 ${memberName} 不存在`)
      }

      // 删除成员目录
      await fs.promises.rm(memberDir, { recursive: true })

      return true
    } catch (error) {
      console.error(`删除成员 ${memberName} 失败:`, error)
      return false
    }
  }

  // 获取当前成员目录
  getCurrentMemberDir(): string {
    if (!this.currentMember) {
      throw new Error('未选择成员')
    }
    return path.join(this.membersDir, this.currentMember, 'files')
  }

  // 获取当前成员
  getCurrentMember(): string | null {
    return this.currentMember
  }
} 