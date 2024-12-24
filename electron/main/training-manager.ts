import { FileMetadata, TrainingRecord } from './types'
import fs from 'fs'
import path from 'path'

interface TrainingConfig {
  baseAdjustment: {
    success: number
    fail: number
  }
  intervalMultiplier: {
    success: number
    fail: number
  }
  timeRules: Array<{
    range: [number, number]
    bonus: number
    description: string
  }>
  proficiencyThresholds: {
    low: number
    medium: number
    high: number
  }
  intervals: {
    min: number
    max: number
  }
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
      typeof config.baseAdjustment?.success === 'number' &&
      typeof config.baseAdjustment?.fail === 'number' &&
      Array.isArray(config.timeRules) &&
      typeof config.intervalMultiplier?.success === 'number' &&
      typeof config.intervalMultiplier?.fail === 'number' &&
      typeof config.proficiencyThresholds?.low === 'number' &&
      typeof config.proficiencyThresholds?.medium === 'number' &&
      typeof config.proficiencyThresholds?.high === 'number' &&
      typeof config.intervals?.min === 'number' &&
      typeof config.intervals?.max === 'number'
    )
  }

  public updateConfig(newConfig: TrainingConfig): void {
    this.config = newConfig
  }

  public getDefaultConfig(): TrainingConfig {
    return {
      baseAdjustment: {
        success: 5,
        fail: -10
      },
      intervalMultiplier: {
        success: 1.2,
        fail: 0.8
      },
      timeRules: [
        { range: [-1, 0], bonus: 2, description: '准时或提前1天' },
        { range: [-3, -2], bonus: 0, description: '提前2-3天' },
        { range: [-7, -4], bonus: -1, description: '提前4-7天' },
        { range: [1, 2], bonus: -1, description: '延迟1-2天' },
        { range: [3, 7], bonus: -2, description: '延迟3-7天' },
        { range: [8, Infinity], bonus: -3, description: '延迟超过一周' }
      ],
      proficiencyThresholds: {
        low: 30,
        medium: 70,
        high: 90
      },
      intervals: {
        min: 1,
        max: 21
      }
    }
  }

  calculateNewProficiency(
    currentProficiency: number,
    success: boolean,
    timeDeviation: number
  ): number {
    const baseAdjustment = success 
      ? this.config.baseAdjustment.success 
      : this.config.baseAdjustment.fail

    const timeBonus = this.calculateTimeBonus(timeDeviation)
    
    let newProficiency = currentProficiency + baseAdjustment + timeBonus
    return Math.min(Math.max(newProficiency, 0), 100)
  }

  calculateNextInterval(
    currentProficiency: number,
    lastTrainingDate: string,
    success: boolean
  ): number {
    // 基础乘数
    const baseMultiplier = success 
      ? this.config.intervalMultiplier.success
      : this.config.intervalMultiplier.fail
    
    // 使用分段函数计算调整因子
    const proficiencyFactor = this.calculateProficiencyFactor(currentProficiency)
    
    // 计算实际间隔（当前日期与上次训练日期之间的天数）
    const lastTraining = new Date(lastTrainingDate)
    const now = new Date()
    lastTraining.setHours(0, 0, 0, 0)
    now.setHours(0, 0, 0, 0)
    const actualInterval = Math.floor((now.getTime() - lastTraining.getTime()) / (1000 * 60 * 60 * 24))
    
    // 计算新间隔
    let newInterval = Math.round(actualInterval * baseMultiplier * proficiencyFactor)
    
    // 确保在配置的最小最大值范围内
    return Math.min(Math.max(newInterval, this.config.intervals.min), this.config.intervals.max)
  }

  calculateTimeBonus(timeDeviation: number): number {
    for (const rule of this.config.timeRules) {
      if (timeDeviation >= rule.range[0] && timeDeviation <= rule.range[1]) {
        return rule.bonus
      }
    }
    return this.config.timeRules[this.config.timeRules.length - 1].bonus
  }

  async processTraining(
    metadata: FileMetadata,
    success: boolean,
    trainingDate?: string
  ): Promise<Partial<FileMetadata>> {
    // 验证训练日期
    const validTrainingDate = this.validateTrainingDate(trainingDate, metadata.nextTrainingDate)
    const timeDeviation = this.calculateTimeDeviation(metadata.nextTrainingDate, validTrainingDate)

    const newProficiency = this.calculateNewProficiency(
      metadata.proficiency,
      success,
      timeDeviation
    )

    const newInterval = this.calculateNextInterval(
      newProficiency,
      metadata.lastTrainingDate,
      success
    )

    // 使用实际训练日期计算下一次训练日期
    const nextTrainingDate = new Date(validTrainingDate)
    nextTrainingDate.setDate(nextTrainingDate.getDate() + newInterval)

    const trainingRecord: TrainingRecord = {
      date: validTrainingDate,
      result: success ? 'success' : 'fail',
      proficiencyBefore: metadata.proficiency,
      proficiencyAfter: newProficiency,
      intervalAfter: newInterval,
      isOnTime: timeDeviation <= 0
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

  /**
   * 计算训练时间偏差（单位：天）
   * 正数表示延迟训练，负数表示提前训练
   */
  private calculateTimeDeviation(expectedDate: string, actualDate: string): number {
    const expected = new Date(expectedDate)
    const actual = new Date(actualDate)
    
    // 重置时间部分，只比较日期
    expected.setHours(0, 0, 0, 0)
    actual.setHours(0, 0, 0, 0)
    
    const diffTime = actual.getTime() - expected.getTime()
    return Math.floor(diffTime / (1000 * 60 * 60 * 24))
  }

  /**
   * 计算熟练度调整因子
   * @param timeDeviation 时间偏差（天数）
   * @returns 调整因子 (0-1)
   */
  private calculateProficiencyFactor(proficiency: number): number {
    const { low, medium, high } = this.config.proficiencyThresholds

    if (proficiency < low) {
      // 低熟练度阶段：缓慢增长
      return 1 + (1 - proficiency / 100) * 0.2
    } else if (proficiency < medium) {
      // 中等熟练度阶段：更缓慢的增长
      return 1 + (1 - proficiency / 100) * 0.3
    } else if (proficiency < high) {
      // 较高熟练度阶段：适中增长
      return 1 + (1 - proficiency / 100) * 0.4
    } else {
      // 高熟练度阶段：较快增长
      return 1 + Math.pow(1 - proficiency / 100, 2) * 0.5
    }
  }
}