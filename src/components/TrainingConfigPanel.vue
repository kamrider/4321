<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { TrainingConfig } from '../../electron/preload'
import TrainingSimulator from './TrainingSimulator.vue'

const config = ref<TrainingConfig>({
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
    const configToSave = JSON.parse(JSON.stringify(config.value, (key, value) => {
      if (value === Infinity) {
        return 999999
      }
      return value
    }))
    
    console.log('准备保��配置:', configToSave)
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
      <el-collapse>
        <el-collapse-item title="基础调整" name="1">
          <el-form-item label="成功时的基础分数调整">
            <el-input-number v-model="config.baseAdjustment.success" :step="1" />
          </el-form-item>
          <el-form-item label="失败时的基础分数调整">
            <el-input-number v-model="config.baseAdjustment.fail" :step="1" />
          </el-form-item>
        </el-collapse-item>

        <el-collapse-item title="间隔倍数" name="2">
          <el-form-item label="成功时的间隔倍数">
            <el-input-number v-model="config.intervalMultiplier.success" :step="0.1" :precision="2" />
          </el-form-item>
          <el-form-item label="失败时的间隔倍数">
            <el-input-number v-model="config.intervalMultiplier.fail" :step="0.1" :precision="2" />
          </el-form-item>
        </el-collapse-item>

        <el-collapse-item title="时间规则" name="3">
          <div v-for="(rule, index) in config.timeRules" :key="index" class="rule-item">
            <el-form-item :label="`规则 ${index + 1}`">
              <div class="rule-content">
                <el-input-number v-model="rule.range[0]" placeholder="开始天数" />
                <span>至</span>
                <el-input-number v-model="rule.range[1]" placeholder="结束天数" />
                <el-input-number v-model="rule.bonus" placeholder="分数调整" />
                <el-input v-model="rule.description" placeholder="规则描述" />
              </div>
            </el-form-item>
          </div>
        </el-collapse-item>

        <el-collapse-item title="熟练度阈值" name="4">
          <el-form-item label="低熟练度阈值">
            <el-input-number v-model="config.proficiencyThresholds.low" :min="0" :max="100" />
          </el-form-item>
          <el-form-item label="中等熟练度阈值">
            <el-input-number v-model="config.proficiencyThresholds.medium" :min="0" :max="100" />
          </el-form-item>
          <el-form-item label="高熟练度阈值">
            <el-input-number v-model="config.proficiencyThresholds.high" :min="0" :max="100" />
          </el-form-item>
        </el-collapse-item>

        <el-collapse-item title="训练间隔范围" name="5">
          <el-form-item label="最小间隔天数">
            <el-input-number v-model="config.intervals.min" :min="1" />
          </el-form-item>
          <el-form-item label="最大间隔天数">
            <el-input-number v-model="config.intervals.max" :min="1" />
          </el-form-item>
        </el-collapse-item>
      </el-collapse>
    </el-form>

    <TrainingSimulator v-if="!loading" :config="config" />
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

.rule-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 10px;
}

.rule-content {
  display: grid;
  grid-template-columns: 100px auto 100px auto 1fr;
  gap: 10px;
  align-items: center;
}

:deep(.el-collapse) + .simulation-wrapper {
  margin-top: 20px;
}
</style>