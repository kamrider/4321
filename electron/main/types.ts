interface FileMetadata {
  id: string                 // UUID作为唯一标识
  relativePath: string       // 相对于存储目录的路径
  originalFileName: string   // 原始文件名
  uploadDate: string
  originalDate: string
  fileSize: number
  lastModified: string
  hash?: string             // 可选：文件哈希值，用于验证文件完整性
}

interface MetadataStore {
  version: string           // 元数据版本号，便于后续升级
  baseDir: string          // 基础目录，用于相对路径解析
  files: {
    [id: string]: FileMetadata
  }
} 