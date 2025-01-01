import { FileMetadata, TrainingRecord } from './types'
import fs from 'fs'
import path from 'path'

export interface TrainingConfig {
  proficiencyIntervals: Array<{
    range: [number, number]
    interval: number
    description: string
  }>
}

export class TrainingManager {
  private config: TrainingConfig

  constructor(configPath?: string) {
    this.config = this.loadConfig(configPath)
  }

  private loadConfig(configPath?: string): TrainingConfig {
    try {
      if (configPath) {
        if (!fs.existsSync(configPath)) {
          console.warn('配置文件不存在:', configPath)
          return this.getDefaultConfig()
        }
        
        const configData = fs.readFileSync(configPath, 'utf-8')
        const config = JSON.parse(configData)
        
        // 验证配置文件结构
        if (!this.validateConfig(config)) {
          console.warn('配置文件格式无效，使用默认配置')
          return this.getDefaultConfig()
        }
        
        return config
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error('配置文件JSON格式错误:', error)
      } else {
        console.error('读取配置文件失败:', error)
      }
    }
    return this.getDefaultConfig()
  }

  public validateConfig(config: any): config is TrainingConfig {
    return (
      typeof config === 'object' &&
      config !== null &&
      Array.isArray(config.proficiencyIntervals) &&
      config.proficiencyIntervals.every((interval: any) =>
        Array.isArray(interval.range) &&
        interval.range.length === 2 &&
        typeof interval.range[0] === 'number' &&
        typeof interval.range[1] === 'number' &&
        typeof interval.interval === 'number' &&
        typeof interval.description === 'string'
      )
    )
  }

  public updateConfig(newConfig: TrainingConfig): void {
    this.config = newConfig
  }

  public getDefaultConfig(): TrainingConfig {
    return {
      proficiencyIntervals: [
        { range: [0, 9], interval: 1, description: '初学者' },
        { range: [10, 19], interval: 3, description: '基础' },
        { range: [20, 39], interval: 7, description: '进阶' },
        { range: [40, 69], interval: 14, description: '熟练' },
        { range: [70, 89], interval: 21, description: '精通' },
        { range: [90, 100], interval: 30, description: '专家' }
      ]
    }
  }

  calculateNewProficiency(
    currentProficiency: number,
    success: boolean
  ): number {
    // 简化熟练度计算：成功+5，失败-10
    const adjustment = success ? 10 : -10
    return Math.min(Math.max(currentProficiency + adjustment, 0), 100)
  }

  calculateNextInterval(currentProficiency: number): number {
    // 根据当前熟练度找到对应的区间
    for (const interval of this.config.proficiencyIntervals) {
      if (currentProficiency >= interval.range[0] && currentProficiency <= interval.range[1]) {
        return interval.interval
      }
    }
    // 如果没有找到匹配的区间，返回最小间隔
    return this.config.proficiencyIntervals[0].interval
  }

  async processTraining(
    metadata: FileMetadata,
    success: boolean,
    trainingDate?: string
  ): Promise<Partial<FileMetadata>> {
    const validTrainingDate = this.validateTrainingDate(trainingDate)

    const newProficiency = this.calculateNewProficiency(
      metadata.proficiency,
      success
    )

    const newInterval = this.calculateNextInterval(newProficiency)

    // 使用实际训练日期计算下一次训练日期
    const nextTrainingDate = new Date(validTrainingDate)
    nextTrainingDate.setDate(nextTrainingDate.getDate() + newInterval)

    const trainingRecord: TrainingRecord = {
      date: validTrainingDate,
      result: success ? 'success' : 'fail',
      proficiencyBefore: metadata.proficiency,
      proficiencyAfter: newProficiency,
      intervalAfter: newInterval,
      isOnTime: true // 由于不再考虑时间偏差，默认都是准时
    }

    return {
      proficiency: newProficiency,
      trainingInterval: newInterval,
      lastTrainingDate: validTrainingDate,
      nextTrainingDate: nextTrainingDate.toISOString(),
      trainingRecords: [...metadata.trainingRecords, trainingRecord]
    }
  }

  private validateTrainingDate(trainingDate?: string): string {
    if (!trainingDate) {
      return new Date().toISOString()
    }
    
    try {
      new Date(trainingDate).toISOString()
      return trainingDate
    } catch (error) {
      console.warn('无效的训练日期，使用当前时间:', error)
      return new Date().toISOString()
    }
  }
}