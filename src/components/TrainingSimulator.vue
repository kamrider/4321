<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TrainingConfig } from '../../electron/preload'

const props = defineProps<{
  config: TrainingConfig
}>()

interface SimulationResult {
  title: string
  intervals: number[]
  proficiencies: number[]
}

const simulations = ref<SimulationResult[]>([])

// 模拟训练过程
const simulateTraining = (successPattern: boolean[]) => {
  let proficiency = 50 // 初始熟练度
  let interval = 1 // 初始间隔
  const intervals = [interval]
  const proficiencies = [proficiency]

  for (let i = 0; i < 10; i++) {
    const success = successPattern[i % successPattern.length]
    
    // 计算新的熟练度
    const baseAdjustment = success 
      ? props.config.baseAdjustment.success 
      : props.config.baseAdjustment.fail
    
    proficiency = Math.min(Math.max(proficiency + baseAdjustment, 0), 100)
    
    // 计算新的间隔
    const multiplier = success 
      ? props.config.intervalMultiplier.success 
      : props.config.intervalMultiplier.fail
    
    const proficiencyFactor = 1 + Math.pow(1 - proficiency / 100, 2.5) * 0.8
    interval = Math.round(interval * multiplier * proficiencyFactor)
    interval = Math.min(Math.max(interval, props.config.intervals.min), props.config.intervals.max)
    
    intervals.push(interval)
    proficiencies.push(proficiency)
  }

  return { intervals, proficiencies }
}

// 更新模拟结果
const updateSimulations = () => {
  const patterns = [
    { pattern: [false, false, false, false], title: '连续失败' },
    { pattern: [true, true, true, true], title: '连续成功' },
    { pattern: [false, true, false, true], title: '失败/成功交替' },
    { pattern: [true, false, true, false], title: '成功/失败交替' }
  ]

  simulations.value = patterns.map(({ pattern, title }) => {
    const { intervals, proficiencies } = simulateTraining(pattern)
    return { title, intervals, proficiencies }
  })
}

// 监听配置变化
watch(() => props.config, updateSimulations, { deep: true })

// 初始化
updateSimulations()
</script>

<template>
  <div class="simulation-wrapper">
    <el-collapse>
      <el-collapse-item title="训练模拟" name="simulation">
        <div class="simulation-content">
          <div v-for="sim in simulations" :key="sim.title" class="simulation-item">
            <h4>{{ sim.title }}</h4>
            <div class="data-row">
              <div class="data-label">间隔变化：</div>
              <div class="data-values">
                {{ sim.intervals.join(' → ') }}
              </div>
            </div>
            <div class="data-row">
              <div class="data-label">熟练度变化：</div>
              <div class="data-values">
                {{ sim.proficiencies.map(p => Math.round(p)).join(' → ') }}
              </div>
            </div>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.simulation-wrapper {
  margin-top: 20px;
}

.simulation-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.simulation-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 12px;
}

.simulation-item h4 {
  margin: 0 0 8px 0;
  color: var(--el-text-color-primary);
}

.data-row {
  display: flex;
  margin-bottom: 4px;
}

.data-label {
  flex-shrink: 0;
  width: 100px;
  color: var(--el-text-color-secondary);
}

.data-values {
  flex-grow: 1;
  word-break: break-all;
}
</style> 