<template>
  <div class="members-container">
    <div class="header">
      <h2>成员管理</h2>
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        添加成员
      </el-button>
    </div>

    <el-card v-if="loading" class="loading-card">
      <el-skeleton :rows="3" animated />
    </el-card>

    <template v-else>
      <el-empty
        v-if="members.length === 0"
        description="暂无成员"
      />

      <div v-else class="members-list">
        <el-card
          v-for="member in members"
          :key="member"
          class="member-card"
          :class="{ 'is-current': member === currentMember }"
        >
          <div class="member-info">
            <div class="member-name">
              <el-icon v-if="member === currentMember"><Check /></el-icon>
              {{ member }}
            </div>
            <div class="member-actions">
              <el-button
                v-if="member !== currentMember"
                type="primary"
                size="small"
                @click="handleSwitch(member)"
              >
                切换到此成员
              </el-button>
              <el-button
                v-if="member !== currentMember"
                type="danger"
                size="small"
                @click="handleDelete(member)"
              >
                删除
              </el-button>
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
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Check } from '@element-plus/icons-vue'

const members = ref<string[]>([])
const currentMember = ref<string | null>(null)
const loading = ref(true)
const showAddDialog = ref(false)
const adding = ref(false)
const form = ref({
  name: ''
})

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

// 切换成员
const handleSwitch = async (memberName: string) => {
  try {
    const result = await window.ipcRenderer.invoke('member:switch', memberName)
    if (result.success) {
      ElMessage.success('切换成功')
      currentMember.value = memberName
    } else {
      ElMessage.error(result.message || '切换失败')
    }
  } catch (error) {
    console.error('切换成员失败:', error)
    ElMessage.error('切换成员失败')
  }
}

// 删除成员
const handleDelete = async (memberName: string) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除该成员吗？删除后数据将无法恢复。',
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const result = await window.ipcRenderer.invoke('member:delete', memberName)
    if (result.success) {
      ElMessage.success('删除成功')
      await loadMembers()
    } else {
      ElMessage.error(result.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除成员失败:', error)
      ElMessage.error('删除成员失败')
    }
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
}

.header h2 {
  margin: 0;
  font-size: 24px;
  color: var(--el-text-color-primary);
}

.loading-card {
  padding: 20px;
}

.members-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.member-card {
  transition: all 0.3s ease;
}

.member-card.is-current {
  border: 2px solid var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.member-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-name {
  font-size: 18px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
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
</style> 