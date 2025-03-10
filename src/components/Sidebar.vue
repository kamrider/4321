<template>
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
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Upload, DocumentCopy, Notebook, Setting, User, Folder } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()

// 控制菜单折叠
const isCollapse = ref(false)

// 当前激活的路由
const activeRoute = computed(() => route.path)

// 处理菜单选择
const handleSelect = (index: string) => {
  router.push(index)
}
</script>

<style scoped>
.sidebar-menu {
  height: 100vh;
  border-right: 1px solid #e6e6e6;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  overflow: hidden;
  will-change: width;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 200px;
}

/* 适配窗口大小变化 */
@media (max-width: 768px) {
  .sidebar-menu:not(.el-menu--collapse) {
    width: 64px;
  }
}

/* 自定义菜单样式 */
:deep(.el-menu-item) {
  height: 56px;
  line-height: 56px;
  padding: 0 20px !important;
  transition: background-color 0.3s ease, color 0.3s ease, transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  backface-visibility: hidden;
  transform-style: preserve-3d;
}

:deep(.el-menu-item.is-active) {
  background-color: #e6f0fc !important;
  border-right: 2px solid #409EFF;
  color: #409EFF !important;
}

:deep(.el-menu-item:hover) {
  background-color: #eef5fc !important;
  color: #409EFF !important;
  transform: translateX(5px);
}

/* 图标样式 */
:deep(.el-icon) {
  font-size: 18px;
  vertical-align: middle;
  margin-right: 5px;
  color: inherit;
  transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform;
}

:deep(.el-menu-item:hover .el-icon) {
  transform: scale(1.15);
}

/* 确保内容不会被遮挡 */
:deep(.el-menu--collapse) {
  width: 64px;
}

/* 添加菜单项文字的过渡效果 */
:deep(.el-menu-item span) {
  transition: opacity 0.3s ease;
  will-change: opacity;
}

/* 添加折叠/展开的动画 */
.el-menu--collapse :deep(.el-menu-item) {
  padding: 0 20px !important;
}
</style> 