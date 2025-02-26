<template>
  <div class="members-container">
    <div class="header">
      <h2>成员管理</h2>
      <div class="header-right">
        <el-button-group class="sort-controls">
          <el-button 
            :type="sortType === 'name' ? 'primary' : 'default'"
            @click="handleSort('name')"
          >
            名称
            <el-icon v-if="sortType === 'name'">
              <component :is="sortOrder === 'desc' ? 'ArrowDown' : 'ArrowUp'" />
            </el-icon>
          </el-button>
          <el-button 
            :type="sortType === 'lastUsed' ? 'primary' : 'default'"
            @click="handleSort('lastUsed')"
          >
            最近使用
            <el-icon v-if="sortType === 'lastUsed'">
              <component :is="sortOrder === 'desc' ? 'ArrowDown' : 'ArrowUp'" />
            </el-icon>
          </el-button>
        </el-button-group>

        <el-input
          v-model="searchKeyword"
          placeholder="搜索成员"
          prefix-icon="Search"
          clearable
          class="search-input"
        />
        <el-button
          type="primary"
          @click="toggleSelectMode"
          :class="{ 'is-active': isSelectMode }"
        >
          {{ isSelectMode ? '退出选择' : '选择成员' }}
        </el-button>
        <el-button
          v-if="isSelectMode"
          type="danger"
          :disabled="selectedCount === 0"
          @click="handleBatchDelete"
        >
          <el-icon><Delete /></el-icon>
          删除选中 ({{ selectedCount }})
        </el-button>
        <el-button v-else type="primary" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon>
          添加成员
        </el-button>
      </div>
    </div>

    <el-card v-if="loading" class="loading-card">
      <el-skeleton :rows="3" animated />
    </el-card>

    <template v-else>
      <el-empty
        v-if="filteredMembers.length === 0"
        :description="searchKeyword ? '未找到匹配的成员' : '暂无成员'"
      />

      <div v-else class="members-list">
        <el-card
          v-for="member in filteredMembers"
          :key="member"
          class="member-card"
          :class="{
            'is-current': member === currentMember,
            'is-selected': selectedMembers.includes(member),
            'is-selectable': isSelectMode && member !== currentMember,
            'is-disabled': isSelectMode && member === currentMember
          }"
          @click="isSelectMode ? handleSelect(member) : handleSwitch(member)"
        >
          <div class="member-info">
            <div class="member-name">
              <template v-if="isSelectMode">
                <el-icon v-if="selectedMembers.includes(member)"><Check /></el-icon>
                <el-tag v-if="member === currentMember" size="small" type="warning">当前使用中</el-tag>
              </template>
              <el-icon v-else-if="member === currentMember"><Check /></el-icon>
              {{ member }}
            </div>
          </div>
        </el-card>
      </div>
    </template>

    <!-- 添加成员对话框 -->
    <el-dialog
      v-model="showAddDialog"
      title="添加成员"
      width="30%"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="80px">
        <el-form-item label="成员名称">
          <el-input v-model="form.name" placeholder="请输入成员名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button type="primary" @click="handleAdd" :loading="adding">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Check, Delete, ArrowDown, ArrowUp } from '@element-plus/icons-vue'

const members = ref<string[]>([])
const currentMember = ref<string | null>(null)
const loading = ref(true)
const showAddDialog = ref(false)
const adding = ref(false)
const form = ref({
  name: ''
})
const searchKeyword = ref('')
const isSelectMode = ref(false)
const selectedMembers = ref<string[]>([])

// 添加排序相关的响应式变量
const sortType = ref<'name' | 'lastUsed'>('name')
const sortOrder = ref<'asc' | 'desc'>('asc')
const lastUsedTime = ref<Map<string, number>>(new Map())

const filteredMembers = computed(() => {
  let result = [...members.value]
  
  // 关键字筛选
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(member => 
      member.toLowerCase().includes(keyword)
    )
  }
  
  // 排序
  result.sort((a, b) => {
    const factor = sortOrder.value === 'desc' ? -1 : 1
    
    if (sortType.value === 'name') {
      return factor * a.localeCompare(b)
    } else {
      // 最近使用时间排序，当前使用的成员始终排在最前面
      if (a === currentMember.value) return -1 * factor
      if (b === currentMember.value) return 1 * factor
      
      const timeA = lastUsedTime.value.get(a) || 0
      const timeB = lastUsedTime.value.get(b) || 0
      return factor * (timeB - timeA)
    }
  })
  
  return result
})

const selectedCount = computed(() => selectedMembers.value.length)

const toggleSelectMode = () => {
  isSelectMode.value = !isSelectMode.value
  if (!isSelectMode.value) {
    selectedMembers.value = []
  }
}

const handleSelect = (member: string) => {
  if (!isSelectMode.value) return
  if (member === currentMember.value) {
    ElMessage.warning('当前使用中的用户不能删除')
    return
  }
  const index = selectedMembers.value.indexOf(member)
  if (index === -1) {
    selectedMembers.value.push(member)
  } else {
    selectedMembers.value.splice(index, 1)
  }
}

const handleBatchDelete = async () => {
  if (selectedMembers.value.length === 0) {
    ElMessage.warning('请先选择要删除的成员')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedMembers.value.length} 个成员吗？删除后数据将无法恢复。`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    let successCount = 0
    for (const member of selectedMembers.value) {
      try {
        const result = await window.ipcRenderer.invoke('member:delete', member)
        if (result.success) {
          successCount++
        }
      } catch (error) {
        console.error(`删除成员 ${member} 失败:`, error)
      }
    }

    if (successCount > 0) {
      ElMessage.success(`成功删除 ${successCount} 个成员`)
      await loadMembers()
      selectedMembers.value = []
      isSelectMode.value = false
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量删除成员失败:', error)
      ElMessage.error('批量删除失败')
    }
  }
}

// 加载成员列表
const loadMembers = async () => {
  try {
    const result = await window.ipcRenderer.invoke('member:get-list')
    if (result.success) {
      members.value = result.data
    } else {
      ElMessage.error('获取成员列表失败')
    }
  } catch (error) {
    console.error('获取成员列表失败:', error)
    ElMessage.error('获取成员列表失败')
  }
}

// 获取当前成员
const loadCurrentMember = async () => {
  try {
    const result = await window.ipcRenderer.invoke('member:get-current')
    if (result.success) {
      currentMember.value = result.data
    }
  } catch (error) {
    console.error('获取当前成员失败:', error)
  }
}

// 初始化数据
onMounted(async () => {
  try {
    await Promise.all([loadMembers(), loadCurrentMember()])
    // 初始化当前成员的最后使用时间
    if (currentMember.value) {
      lastUsedTime.value.set(currentMember.value, Date.now())
    }
  } finally {
    loading.value = false
  }
})

// 添加成员
const handleAdd = async () => {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入成员名称')
    return
  }

  adding.value = true
  try {
    const result = await window.ipcRenderer.invoke('member:create', form.value.name)
    if (result.success) {
      ElMessage.success('添加成功')
      await loadMembers()
      showAddDialog.value = false
      form.value.name = ''
    } else {
      ElMessage.error(result.message || '添加失败')
    }
  } catch (error) {
    console.error('添加成员失败:', error)
    ElMessage.error('添加成员失败')
  } finally {
    adding.value = false
  }
}

// 添加排序处理函数
const handleSort = (type: 'name' | 'lastUsed') => {
  if (sortType.value === type) {
    // 如果点击相同类型，切换排序顺序
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  } else {
    // 如果点击不同类型，设置新类型并默认升序
    sortType.value = type
    sortOrder.value = 'asc'
  }
}

// 修改切换成员函数，添加最近使用时间记录
const handleSwitch = async (memberName: string) => {
  try {
    const result = await window.ipcRenderer.invoke('member:switch', memberName)
    if (result.success) {
      ElMessage.success('切换成功')
      currentMember.value = memberName
      // 记录最后使用时间
      lastUsedTime.value.set(memberName, Date.now())
    } else {
      ElMessage.error(result.message || '切换失败')
    }
  } catch (error) {
    console.error('切换成员失败:', error)
    ElMessage.error('切换成员失败')
  }
}
</script>

<style scoped>
.members-container {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  /* 添加过渡效果 */
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.header h2 {
  margin: 0;
  font-size: 24px;
  color: var(--el-text-color-primary);
  /* 添加文字过渡效果 */
  transition: transform 0.3s ease, color 0.3s ease;
}

/* 添加标题悬停效果 */
.header h2:hover {
  transform: translateX(5px);
  color: var(--el-color-primary);
}

.header-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-input {
  width: 200px;
  /* 添加搜索框过渡效果 */
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* 搜索框悬停效果 */
.search-input:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.search-input:focus-within {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 220px; /* 聚焦时略微变宽 */
}

.loading-card {
  padding: 20px;
  /* 添加加载卡片动画 */
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.members-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  /* 添加列表动画 */
  animation: fadeInUp 0.6s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.member-card {
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
  /* 添加卡片出现动画 */
  animation: cardAppear 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform-origin: center;
  will-change: transform, box-shadow;
  position: relative;
  overflow: hidden;
}

@keyframes cardAppear {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 添加卡片悬停效果 */
.member-card:hover {
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

/* 添加卡片点击效果 */
.member-card:active {
  transform: translateY(-2px) scale(0.98);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* 添加卡片波纹效果 */
.member-card::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  background: rgba(255, 255, 255, 0.5);
  opacity: 0;
  border-radius: 100%;
  transform: scale(1, 1) translate(-50%);
  transform-origin: 50% 50%;
}

.member-card:active::after {
  animation: ripple 0.8s ease-out;
}

@keyframes ripple {
  0% {
    transform: scale(0, 0);
    opacity: 0.5;
  }
  20% {
    transform: scale(25, 25);
    opacity: 0.3;
  }
  100% {
    opacity: 0;
    transform: scale(40, 40);
  }
}

.member-card.is-current {
  border: 2px solid var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  /* 添加当前卡片动画 */
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(64, 158, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0);
  }
}

.member-card.is-selected {
  border: 2px solid var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
  /* 添加选中卡片动画 */
  animation: selectedPulse 2s infinite;
}

@keyframes selectedPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(245, 108, 108, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(245, 108, 108, 0);
  }
}

.member-card.is-selectable:hover {
  border: 2px solid var(--el-color-danger);
  transform: translateY(-5px) scale(1.02);
}

.member-card.is-disabled {
  cursor: not-allowed;
  opacity: 0.8;
}

.member-card.is-disabled:hover {
  transform: none;
  border: 1px solid var(--el-border-color);
  box-shadow: none;
}

.member-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s ease;
}

.member-name {
  font-size: 18px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

/* 添加名称悬停效果 */
.member-card:hover .member-name {
  color: var(--el-color-primary);
  transform: translateX(5px);
}

.member-name .el-tag {
  margin-right: 8px;
  transition: all 0.3s ease;
}

.member-card:hover .member-name .el-tag {
  transform: scale(1.05);
}

.member-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.is-active {
  background-color: var(--el-color-danger);
  border-color: var(--el-color-danger);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* 添加按钮悬停效果 */
.el-button {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  overflow: hidden;
}

.el-button:not(.is-disabled):hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.el-button:not(.is-disabled):active {
  transform: translateY(0) scale(0.98);
}

/* 添加按钮波纹效果 */
.el-button::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  background: rgba(255, 255, 255, 0.5);
  opacity: 0;
  border-radius: 100%;
  transform: scale(1, 1) translate(-50%);
  transform-origin: 50% 50%;
}

.el-button:active::after {
  animation: ripple 0.8s ease-out;
}

.sort-controls {
  margin-right: 16px;
  transition: all 0.3s ease;
}

.sort-controls:hover {
  transform: translateY(-2px);
}

.sort-controls .el-button {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sort-controls .el-button .el-icon {
  transition: transform 0.3s ease;
}

.sort-controls .el-button:hover .el-icon {
  transform: scale(1.2);
}

/* 添加对话框动画 */
:deep(.el-dialog) {
  transform: scale(0.9);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

:deep(.el-dialog.dialog-fade-enter-active) {
  transform: scale(1);
  opacity: 1;
}

:deep(.el-dialog.dialog-fade-leave-active) {
  transform: scale(0.9);
  opacity: 0;
}

/* 添加空状态动画 */
:deep(.el-empty) {
  animation: fadeIn 0.5s ease-out;
}

/* 添加骨架屏动画 */
:deep(.el-skeleton) {
  animation: skeletonPulse 1.5s infinite;
}

@keyframes skeletonPulse {
  0% {
    opacity: 0.7;
  }
  50% {
    opacity: 0.9;
  }
  100% {
    opacity: 0.7;
  }
}

/* 添加图标动画 */
.el-icon {
  transition: transform 0.3s ease;
}

.member-card:hover .el-icon {
  transform: scale(1.2);
}
</style> 