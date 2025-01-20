interface TrainingRecord {
  date: string                // 训练日期
  result: 'success' | 'fail'  // 训练结果
  proficiencyBefore: number   // 训练前熟练度
  proficiencyAfter: number    // 训练后熟练度
  intervalAfter: number       // 训练后设定的下次间隔
  isOnTime: boolean          // 是否按时训练
  answerTime?: number         // 实际答题时间（毫秒）
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

// 在现有的接口定义后添加考试相关的类型

interface ExamRecord {
  id: string                     
  startTime: string             
  endTime?: string             
  status: ExamStatus           
  currentIndex: number         
  items: ExamItem[]           
  totalTime: number           
  usedTime: number
  isGrading: boolean          // 是否在评分阶段
  gradingIndex?: number       // 当前评分的题目索引
}

type ExamStatus = 'ongoing' | 'paused' | 'completed' | 'abandoned'

interface ExamItem {
  fileId: string              
  timeLimit: number          
  timeSpent: number         
  preview: string           
  status: ExamItemStatus    
  answer?: boolean          // 考试时的作答结果
  answeredAt?: string       
  gradeResult?: {           // 评分结果
    isCorrect: boolean      // 是否正确
    gradedAt: string       // 评分时间
    trainingRecord?: TrainingRecord  // 关联的训练记录
  }
}

type ExamItemStatus = 'pending' | 'ongoing' | 'completed' | 'grading' | 'graded' 