interface FileMetadata {
  id: string                    // UUID作为唯一标识
  relativePath: string          // 相对于存储目录的路径
  originalFileName: string      // 原始文件名
  uploadDate: string
  originalDate: string
  fileSize: number
  lastModified: string
  hash?: string                // 可选：文件哈希值，用于验证文件完整性
  
  // 错题管理相关字段
  proficiency: number          // 熟练度 (0-100)
  trainingInterval: number     // 训练间隔(天)
  lastTrainingDate: string     // 上次训练时间
  nextTrainingDate: string     // 下次训练时间
  subject: string             // 科目
  tags: string[]              // 标签（例如：难度、类型等）
  notes?: string              // 可选：笔记或备注
}

interface MetadataStore {
  version: string             // 元数据版本号，便于后续升级
  baseDir: string            // 基础目录，用于相对路径解析
  migrationStatus?: {
    inProgress: boolean
    lastMigration: string
    failedFiles: string[]
  }
  files: {
    [id: string]: FileMetadata
  }
} 