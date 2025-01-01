<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { TrainingConfig } from '../../electron/preload'

const config = ref<TrainingConfig>({
  proficiencyIntervals: [
    { range: [0, 9], interval: 1, description: '初学者' },
    { range: [10, 19], interval: 2, description: '入门' },
    { range: [20, 29], interval: 4, description: '基础' },
    { range: [30, 39], interval: 7, description: '进步' },
    { range: [40, 49], interval: 10, description: '进阶' },
    { range: [50, 59], interval: 14, description: '熟练' },
    { range: [60, 69], interval: 18, description: '精通' },
    { range: [70, 79], interval: 21, description: '专家' },
    { range: [80, 89], interval: 25, description: '大师' },
    { range: [90, 100], interval: 30, description: '宗师' }
  ]
})

const loading = ref(true)

onMounted(async () => {
  try {
    const result = await window.ipcRenderer.config.getTrainingConfig()
    if (result.success && result.data) {
      config.value = result.data
    }
  } catch (error) {
    ElMessage.error('加载配置失败')
  } finally {
    loading.value = false
  }
})

const saveConfig = async () => {
  try {
    const configToSave = JSON.parse(JSON.stringify(config.value))
    console.log('准备保存配置:', configToSave)
    const result = await window.ipcRenderer.config.updateTrainingConfig(configToSave)
    console.log('保存配置结果:', result)
    if (result.success) {
      ElMessage.success('保存成功')
    } else {
      throw new Error(result.error)
    }
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  }
}

const addInterval = () => {
  config.value.proficiencyIntervals.push({
    range: [0, 0],
    interval: 1,
    description: ''
  })
}

const removeInterval = (index: number) => {
  config.value.proficiencyIntervals.splice(index, 1)
}
</script>

<template>
  <el-card class="config-card" v-loading="loading">
    <template #header>
      <div class="card-header">
        <span>训练配置</span>
        <el-button type="primary" @click="saveConfig">保存配置</el-button>
      </div>
    </template>

    <el-form label-position="top">
      <div class="intervals-header">
        <h3>熟练度区间配置</h3>
        <el-button type="primary" size="small" @click="addInterval">添加区间</el-button>
      </div>
      
      <div v-for="(interval, index) in config.proficiencyIntervals" :key="index" class="interval-item">
        <div class="interval-header">
          <span>区间 {{ index + 1 }}</span>
          <el-button type="danger" size="small" @click="removeInterval(index)">删除</el-button>
        </div>
        
        <div class="interval-content">
          <el-form-item label="熟练度范围">
            <div class="range-inputs">
              <el-input-number v-model="interval.range[0]" :min="0" :max="100" placeholder="最小值" />
              <span>至</span>
              <el-input-number v-model="interval.range[1]" :min="0" :max="100" placeholder="最大值" />
            </div>
          </el-form-item>
          
          <el-form-item label="训练间隔（天）">
            <el-input-number v-model="interval.interval" :min="1" :max="365" />
          </el-form-item>
          
          <el-form-item label="描述">
            <el-input v-model="interval.description" placeholder="请输入区间描述" />
          </el-form-item>
        </div>
      </div>
    </el-form>
  </el-card>
</template>

<style scoped>
.config-card {
  margin: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.intervals-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.intervals-header h3 {
  margin: 0;
}

.interval-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 15px;
  margin-bottom: 15px;
}

.interval-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.interval-content {
  display: grid;
  gap: 15px;
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>