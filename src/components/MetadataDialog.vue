<script setup lang="ts">
import { computed } from 'vue'
import type { MistakeItem } from '../../electron/preload'

const props = defineProps<{
  modelValue: boolean
  item: MistakeItem | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 复用日期格式化函数
const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (error) {
    return dateStr
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="训练信息"
    width="500px"
  >
    <div v-if="item" class="metadata-content">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="熟练度">
          {{ item.metadata.proficiency }}
        </el-descriptions-item>
        <el-descriptions-item label="训练间隔">
          {{ item.metadata.trainingInterval }} 天
        </el-descriptions-item>
        <el-descriptions-item label="上次训练">
          {{ formatDate(item.metadata.lastTrainingDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="下次训练">
          {{ formatDate(item.metadata.nextTrainingDate) }}
        </el-descriptions-item>
        <el-descriptions-item label="答题时限">
          {{ item.metadata.answerTimeLimit }} 秒
        </el-descriptions-item>
        <el-descriptions-item label="科目">
          {{ item.metadata.subject || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="标签">
          <el-tag 
            v-for="tag in item.metadata.tags" 
            :key="tag"
            class="tag-item"
          >
            {{ tag }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </el-dialog>
</template>

<style scoped>
.tag-item {
  margin-right: 8px;
  margin-bottom: 4px;
}
</style> 