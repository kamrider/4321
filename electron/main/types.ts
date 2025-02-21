interface TrainingRecord {
  date: string                // 训练日期
  result: 'success' | 'fail'  // 训练结果
  proficiencyBefore: number   // 训练前熟练度
  proficiencyAfter: number    // 训练后熟练度
  intervalAfter: number       // 训练后设定的下次间隔
  isOnTime: boolean          // 是否按时训练
  answerTime?: number         // 实际答题时间（毫秒）
  trace?: {                  // 做题痕迹图片信息
    id: string              // 痕迹图片的唯一标识
    relativePath: string    // 图片相对路径
    originalFileName: string // 原始文件名
  }
}

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
  trainingRecords: TrainingRecord[]  // 训练历史记录数组
  subject: string             
  tags: string[]              
  notes?: string              
  type?: 'mistake' | 'answer'    // 图片类型
  pairId?: string               // 配对的图片ID
  isPaired?: boolean           // 是否已配对
  answerTimeLimit?: number     // 答题时限（秒）
  isFrozen?: boolean           // 是否被冻结（例如：已导出但未完成训练）
  previewPath?: string;  // 预览图的相对路径
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

// 添加用户相关的类型定义
interface User {
  id: string
  username: string
  passwordHash: string
  createdAt: string
  lastLoginAt: string
}

interface UserStore {
  version: string
  users: {
    [id: string]: User
  }
  currentUser?: string
}

// 登录结果类型
interface LoginResult {
  success: boolean
  data?: {
    userId: string
    username: string
  }
  error?: string
} 