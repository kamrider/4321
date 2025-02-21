import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'

export class UserManager {
  private readonly userStorePath: string
  private readonly usersFile: string
  private userStore: UserStore

  constructor() {
    this.userStorePath = path.join(app.getPath('userData'), 'users')
    this.usersFile = path.join(this.userStorePath, 'users.json')
    
    // 确保用户存储目录存在
    fs.mkdirSync(this.userStorePath, { recursive: true })
    
    // 初始化或加载用户存储
    this.userStore = this.loadUserStore()
  }

  private loadUserStore(): UserStore {
    try {
      if (fs.existsSync(this.usersFile)) {
        const data = fs.readFileSync(this.usersFile, 'utf-8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('加载用户数据失败:', error)
    }
    
    // 返回默认存储结构
    return {
      version: '1.0',
      users: {}
    }
  }

  private saveUserStore() {
    try {
      fs.writeFileSync(this.usersFile, JSON.stringify(this.userStore, null, 2))
    } catch (error) {
      console.error('保存用户数据失败:', error)
      throw error
    }
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex')
  }

  private createUserDirectory(userId: string) {
    const userDir = path.join(this.userStorePath, userId)
    const imagesDir = path.join(userDir, 'images')
    
    fs.mkdirSync(userDir, { recursive: true })
    fs.mkdirSync(imagesDir, { recursive: true })
    
    // 创建用户的metadata文件
    const metadataFile = path.join(userDir, 'metadata.json')
    const defaultMetadata = {
      version: '1.1',
      baseDir: imagesDir,
      files: {}
    }
    
    fs.writeFileSync(metadataFile, JSON.stringify(defaultMetadata, null, 2))
  }

  async register(username: string, password: string): Promise<LoginResult> {
    try {
      // 检查用户名是否已存在
      if (Object.values(this.userStore.users).some(user => user.username === username)) {
        return { success: false, error: '用户名已存在' }
      }

      const userId = uuidv4()
      const now = new Date().toISOString()
      
      this.userStore.users[userId] = {
        id: userId,
        username,
        passwordHash: this.hashPassword(password),
        createdAt: now,
        lastLoginAt: now
      }

      // 创建用户目录结构
      this.createUserDirectory(userId)
      
      // 保存用户数据
      this.saveUserStore()

      return { 
        success: true, 
        data: { 
          userId, 
          username 
        } 
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async login(username: string, password: string): Promise<LoginResult> {
    try {
      const user = Object.values(this.userStore.users).find(
        u => u.username === username && u.passwordHash === this.hashPassword(password)
      )

      if (!user) {
        return { success: false, error: '用户名或密码错误' }
      }

      // 更新最后登录时间
      user.lastLoginAt = new Date().toISOString()
      this.userStore.currentUser = user.id
      this.saveUserStore()

      return { 
        success: true, 
        data: { 
          userId: user.id, 
          username: user.username 
        } 
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  getCurrentUser(): string | undefined {
    return this.userStore.currentUser
  }

  getUserStoragePath(userId: string): string {
    return path.join(this.userStorePath, userId, 'images')
  }

  async logout(): Promise<void> {
    this.userStore.currentUser = undefined
    this.saveUserStore()
  }

  getUserInfo(userId: string): User | null {
    return this.userStore.users[userId] || null
  }

  getCurrentUserInfo(): User | null {
    const currentUserId = this.getCurrentUser()
    return currentUserId ? this.getUserInfo(currentUserId) : null
  }

  getAllUsers(): Array<{ id: string; username: string }> {
    return Object.values(this.userStore.users).map(user => ({
      id: user.id,
      username: user.username
    }))
  }
} 