<script setup lang="ts">
import TrainingConfigPanel from '../components/TrainingConfigPanel.vue'
</script>

<template>
  <el-tabs>
    <el-tab-pane label="基本设置">
      <!-- 原有的基本设置内容 -->
    </el-tab-pane>
    <el-tab-pane label="训练配置">
      <TrainingConfigPanel />
    </el-tab-pane>
  </el-tabs>
</template> 