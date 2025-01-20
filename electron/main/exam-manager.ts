import { ExamRecord, ExamItem, ExamStatus, ExamItemStatus } from './types'
import path from 'path'
import fs from 'fs'

export class ExamManager {
  private memberDir: string
  private examsDir: string
  
  constructor(memberDir: string) {
    this.memberDir = memberDir
    this.examsDir = path.join(memberDir, 'exams')
    this.initializeExamDirectory()
  }
  
  private async initializeExamDirectory() {
    try {
      // 确保考试相关目录存在
      const dirs = [
        this.examsDir,
        path.join(this.examsDir, 'ongoing'),
        path.join(this.examsDir, 'completed')
      ]
      
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          await fs.promises.mkdir(dir, { recursive: true })
        }
      }
      
      // 验证目录权限
      await fs.promises.access(this.examsDir, fs.constants.W_OK)
      
    } catch (error) {
      console.error('初始化考试目录失败:', error)
      throw new Error('初始化考试目录失败')
    }
  }
  
  // 创建新考试
  async createExam(items: FileMetadata[]): Promise<ExamRecord> {
    const exam: ExamRecord = {
      id: Date.now().toString(),
      startTime: new Date().toISOString(),
      status: 'ongoing',
      currentIndex: 0,
      isGrading: false,
      items: items.map(item => ({
        fileId: item.id,
        timeLimit: item.answerTimeLimit || 300,
        timeSpent: 0,
        status: 'pending',
        preview: path.join(this.memberDir, item.relativePath)
      })),
      totalTime: items.reduce((total, item) => total + (item.answerTimeLimit || 300), 0),
      usedTime: 0
    }
    
    await this.saveExam(exam)
    return exam
  }
  
  // 获取考试记录
  async getExam(examId: string): Promise<ExamRecord | null> {
    try {
      const examPath = await this.findExamPath(examId)
      if (!examPath) return null
      
      const data = await fs.promises.readFile(examPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.error('获取考试记录失败:', error)
      return null
    }
  }
  
  // 获取所有考试记录
  async getAllExams(): Promise<ExamRecord[]> {
    try {
      const exams: ExamRecord[] = []
      
      // 读取进行中的考试
      const ongoingDir = path.join(this.examsDir, 'ongoing')
      const ongoingFiles = await fs.promises.readdir(ongoingDir)
      
      // 读取已完成的考试
      const completedDir = path.join(this.examsDir, 'completed')
      const completedFiles = await fs.promises.readdir(completedDir)
      
      // 合并所有考试记录
      const allFiles = [
        ...ongoingFiles.map(file => path.join(ongoingDir, file)),
        ...completedFiles.map(file => path.join(completedDir, file))
      ]
      
      for (const filePath of allFiles) {
        if (path.extname(filePath) === '.json') {
          const data = await fs.promises.readFile(filePath, 'utf-8')
          exams.push(JSON.parse(data))
        }
      }
      
      return exams.sort((a, b) => 
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      )
    } catch (error) {
      console.error('获取考试列表失败:', error)
      return []
    }
  }
  
  // 更新考试状态
  async updateExam(examId: string, updates: Partial<ExamRecord>): Promise<boolean> {
    try {
      const exam = await this.getExam(examId)
      if (!exam) return false
      
      const updatedExam = { ...exam, ...updates }
      await this.saveExam(updatedExam)
      return true
    } catch (error) {
      console.error('更新考试状态失败:', error)
      return false
    }
  }
  
  // 更新题目状态
  async updateExamItem(examId: string, itemIndex: number, updates: Partial<ExamItem>): Promise<boolean> {
    try {
      const exam = await this.getExam(examId)
      if (!exam || !exam.items[itemIndex]) return false
      
      exam.items[itemIndex] = { ...exam.items[itemIndex], ...updates }
      await this.saveExam(exam)
      return true
    } catch (error) {
      console.error('更新题目状态失败:', error)
      return false
    }
  }
  
  // 完成考试
  async completeExam(examId: string): Promise<boolean> {
    try {
      const exam = await this.getExam(examId)
      if (!exam) return false
      
      exam.status = 'completed'
      exam.endTime = new Date().toISOString()
      exam.isGrading = true
      exam.gradingIndex = 0
      
      await this.saveExam(exam)
      return true
    } catch (error) {
      console.error('完成考试失败:', error)
      return false
    }
  }
  
  // 删除考试记录
  async deleteExam(examId: string): Promise<boolean> {
    try {
      const examPath = await this.findExamPath(examId)
      if (!examPath) return false
      
      await fs.promises.unlink(examPath)
      return true
    } catch (error) {
      console.error('删除考试记录失败:', error)
      return false
    }
  }
  
  // 私有方法：保存考试记录
  private async saveExam(exam: ExamRecord): Promise<void> {
    const dir = exam.status === 'completed' ? 'completed' : 'ongoing'
    const filePath = path.join(this.examsDir, dir, `${exam.id}.json`)
    await fs.promises.writeFile(filePath, JSON.stringify(exam, null, 2))
  }
  
  // 私有方法：查找考试文件路径
  private async findExamPath(examId: string): Promise<string | null> {
    // 先在进行中的目录查找
    let filePath = path.join(this.examsDir, 'ongoing', `${examId}.json`)
    if (fs.existsSync(filePath)) return filePath
    
    // 再在已完成目录查找
    filePath = path.join(this.examsDir, 'completed', `${examId}.json`)
    if (fs.existsSync(filePath)) return filePath
    
    return null
  }
} 