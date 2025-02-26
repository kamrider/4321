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
        <el-button type="primary" @click="saveConfig" class="save-button">保存配置</el-button>
      </div>
    </template>

    <el-form label-position="top">
      <div class="intervals-header">
        <h3>熟练度区间配置</h3>
        <el-button type="primary" size="small" @click="addInterval" class="add-button">添加区间</el-button>
      </div>
      
      <transition-group name="interval-list" tag="div" class="intervals-container">
        <div v-for="(interval, index) in config.proficiencyIntervals" :key="index" class="interval-item">
          <div class="interval-header">
            <span class="interval-title">区间 {{ index + 1 }}</span>
            <el-button type="danger" size="small" @click="removeInterval(index)" class="remove-button">删除</el-button>
          </div>
          
          <div class="interval-content">
            <el-form-item label="熟练度范围" class="form-item">
              <div class="range-inputs">
                <el-input-number v-model="interval.range[0]" :min="0" :max="100" placeholder="最小值" class="input-number" />
                <span class="range-separator">至</span>
                <el-input-number v-model="interval.range[1]" :min="0" :max="100" placeholder="最大值" class="input-number" />
              </div>
            </el-form-item>
            
            <el-form-item label="训练间隔（天）" class="form-item">
              <el-input-number v-model="interval.interval" :min="1" :max="365" class="input-number" />
            </el-form-item>
            
            <el-form-item label="描述" class="form-item">
              <el-input v-model="interval.description" placeholder="请输入区间描述" class="description-input" />
            </el-form-item>
          </div>
        </div>
      </transition-group>
    </el-form>
  </el-card>
</template>

<style scoped>
.config-card {
  margin: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  animation: fadeIn 0.5s ease-out;
}

.config-card:hover {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
}

.save-button {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.save-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.intervals-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-light);
  transition: all 0.3s ease;
  animation: slideDown 0.4s ease-out;
}

.intervals-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--el-text-color-primary);
  transition: color 0.3s ease;
}

.add-button {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.add-button:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.intervals-container {
  position: relative;
}

.interval-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  background-color: var(--el-bg-color);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  overflow: hidden;
}

.interval-item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
  transform: translateY(-3px);
}

.interval-item:before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background-color: var(--el-color-primary);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.interval-item:hover:before {
  opacity: 1;
}

.interval-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--el-border-color-light);
  transition: all 0.3s ease;
}

.interval-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  transition: all 0.3s ease;
}

.interval-item:hover .interval-title {
  color: var(--el-color-primary);
  transform: translateX(5px);
}

.remove-button {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.remove-button:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 4px 12px rgba(255, 0, 0, 0.1);
}

.interval-content {
  display: grid;
  gap: 20px;
  animation: fadeIn 0.5s ease-out;
}

.form-item {
  transition: all 0.3s ease;
}

.form-item:hover {
  transform: translateX(5px);
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 15px;
  transition: all 0.3s ease;
}

.range-separator {
  font-size: 16px;
  color: var(--el-text-color-secondary);
  transition: color 0.3s ease;
}

.input-number {
  transition: all 0.3s ease;
}

.input-number:hover {
  transform: translateY(-2px);
}

.description-input {
  transition: all 0.3s ease;
}

.description-input:hover {
  transform: translateY(-2px);
}

/* 列表过渡动画 */
.interval-list-enter-active,
.interval-list-leave-active {
  transition: all 0.5s ease;
}

.interval-list-enter-from {
  opacity: 0;
  transform: translateY(30px);
}

.interval-list-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

.interval-list-move {
  transition: transform 0.5s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 适配深色模式 */
@media (prefers-color-scheme: dark) {
  .interval-item {
    background-color: var(--el-bg-color-overlay);
  }
  
  .interval-item:hover {
    background-color: var(--el-bg-color);
  }
}
</style>