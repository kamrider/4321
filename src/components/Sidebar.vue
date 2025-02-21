<template>
  <div class="sidebar">
    <el-menu
      class="sidebar-menu"
      :default-active="activeRoute"
      :collapse="isCollapse"
      @select="handleSelect"
      background-color="#f5f7fa"
      text-color="#303133"
      active-text-color="#409EFF"
    >
      <el-menu-item index="/upload">
        <el-icon><Upload /></el-icon>
        <template #title>上传图片</template>
      </el-menu-item>

      <el-menu-item index="/mistake">
        <el-icon><DocumentCopy /></el-icon>
        <template #title>我的错题</template>
      </el-menu-item>

      <el-menu-item index="/history">
        <el-icon><Notebook /></el-icon>
        <template #title>训练内容</template>
      </el-menu-item>

    <el-menu-item index="/exported-mistakes">
      <el-icon><Folder /></el-icon>
      <template #title>导出记录</template>
    </el-menu-item>

    <el-menu-item index="/members">
      <el-icon><User /></el-icon>
      <template #title>成员管理</template>
    </el-menu-item>

    <el-menu-item index="/settings">
      <el-icon><Setting /></el-icon>
      <template #title>设置</template>
    </el-menu-item>
  </el-menu>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Upload, DocumentCopy, Notebook, Setting, User, Folder } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const currentUser = ref<{ id: string; username: string } | null>(null)
const users = ref<Array<{ id: string; username: string }>>([])

// 控制菜单折叠
const isCollapse = ref(false)

// 当前激活的路由
const activeRoute = computed(() => route.path)

// 处理菜单选择
const handleSelect = (index: string) => {
  router.push(index)
}

// 获取当前用户信息
const loadCurrentUser = async () => {
  try {
    const userId = await window.electron.invoke('user:get-current')
    if (userId) {
      const userInfo = await window.electron.invoke('user:get-info', userId)
      currentUser.value = userInfo
    }
  } catch (error) {
    console.error('加载用户信息失败:', error)
  }
}

// 加载所有用户列表
const loadUsers = async () => {
  try {
    users.value = await window.electron.invoke('user:get-all')
  } catch (error) {
    console.error('加载用户列表失败:', error)
  }
}

// 处理用户相关操作
const handleUserCommand = async (command: string | { type: string; userId: string }) => {
  try {
    if (typeof command === 'object' && command.type === 'switch') {
      // 切换用户
      const result = await window.electron.invoke('user:switch', command.userId)
      if (result.success) {
        ElMessage.success('切换用户成功')
        await loadCurrentUser()
        router.push('/upload')
      } else {
        ElMessage.error(result.error || '切换用户失败')
      }
    } else if (command === 'logout') {
      // 退出登录
      await window.electron.invoke('user:logout')
      currentUser.value = null
      router.push('/login')
      ElMessage.success('已退出登录')
    }
  } catch (error) {
    ElMessage.error('操作失败')
    console.error(error)
  }
}

onMounted(async () => {
  await loadCurrentUser()
  await loadUsers()
})
</script>

<style scoped>
.sidebar {
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e6e6e6;
  background-color: #f5f7fa;
  width: 200px;
  position: fixed;
  left: 0;
  top: 0;
}

.sidebar-menu {
  flex: 1;
  border-right: none;
}

.user-info {
  padding: 16px;
  border-top: 1px solid #e6e6e6;
  background-color: white;
  margin-top: auto;
}

.user-dropdown-link {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px;
}

.username {
  margin: 0 8px;
  font-size: 14px;
  color: #303133;
}

/* 菜单项样式 */
:deep(.el-menu-item) {
  height: 56px;
  line-height: 56px;
  padding: 0 20px !important;
}

:deep(.el-menu-item.is-active) {
  background-color: #e6f0fc !important;
  border-right: 2px solid #409EFF;
  color: #409EFF !important;
}

:deep(.el-menu-item:hover) {
  background-color: #eef5fc !important;
  color: #409EFF !important;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .sidebar {
    width: 64px;
  }
  
  .username {
    display: none;
  }
}
</style> 