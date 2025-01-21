# 考试系统问题清单

## API 调用问题
- [x] ExamDialog.vue 中使用了错误的 API 调用方式 (window.electron.exam)
- [x] 需要统一使用 window.ipcRenderer.exam

## 状态管理问题
- [x] 考试完成后未正确设置 isGrading 状态
- [x] 评分完成后未更新考试的最终状态
- [ ] 缺少考试结果统计（正确率等）
- [x] 状态显示逻辑需要修改（待评分、评分中、已完成）
- [x] 完成考试时未正确更新所有题目状态
  - 问题：最后一题状态仍为 pending
  - 解决方案：
    1. 在 completeExam 中更新所有未完成题目为 completed
    2. 确保 currentIndex 等于题目总数
    3. 设置未答题的 timeSpent 为 0

## 评分系统问题
- [ ] 评分时需要同时更新训练记录
- [ ] 需要添加评分进度显示
- [ ] 需要添加评分结果统计
- [ ] GradingDialog 中的评分逻辑需要完善
  - [ ] 参考 History 组件的详情弹窗实现
  - [ ] 添加答案预览功能
  - [ ] 添加键盘快捷键支持
    - 空格/回车：显示/隐藏答案
    - 右箭头/1：正确
    - 左箭头/0：错误
  - [ ] 添加计时器状态管理
    - 保存每道题的计时状态
    - 切换题目时恢复计时状态
  - [ ] 修改按钮文案为"正确/错误"
  - [ ] 优化答案显示区域样式

## 功能缺失
- [ ] 缺少考试详情页面
- [ ] 继续考试功能未实现
- [ ] 考试中断恢复机制未实现

## 数据统计
- [ ] 缺少考试正确率统计
- [ ] 缺少考试用时统计
- [ ] 缺少历史考试数据分析

## UI/UX 优化
- [ ] 评分界面需要优化
- [ ] 考试状态显示需要优化
- [ ] 需要添加考试进度提示

## 数据一致性问题
- [x] 完成考试时出现重复记录
  - 原因：completeExam 方法创建新记录但未删除旧记录
  - 解决方案：
    1. 在 completeExam 中先删除 ongoing 状态的文件
    2. 再保存 completed 状态的文件
    3. 确保文件移动/删除操作的原子性 
- [x] 考试时间计算不准确
  - 问题：
    1. 题目实际用时计算错误
    2. 总用时累加方式不正确
    3. 快速完成考试时总时间异常
  - 解决方案：
    1. 修改 nextQuestion 中的时间计算逻辑
    2. 在 completeExam 中正确计算总用时
    3. 使用 timeLimit - time.value 计算实际用时 

## 弹窗显示问题
- [ ] GradingDialog 弹窗无法显示
  - 原因：
    1. v-model 绑定问题
    2. currentGradingExam 状态管理问题
  - 解决方案：
    1. 检查 Exam.vue 中的状态初始化
    ```typescript:src/components/Exam.vue
    startLine: 203
    endLine: 206
    ```
    2. 确保 GradingDialog 组件正确接收和处理 v-model
    ```typescript:src/components/GradingDialog.vue
    startLine: 87
    endLine: 90
    ```
    3. 添加状态变更日志用于调试
    4. 在 startGrading 函数中添加状态检查

- [ ] PreviewDialog 组件集成问题
  - 当前问题：
    1. PreviewDialog 组件未正确集成到 GradingDialog
    2. 缺少必要的状态管理和事件处理
  - 解决方案：
    1. 将 PreviewDialog 改造为独立组件
    2. 在 GradingDialog 中正确引用和配置 PreviewDialog
    3. 统一 History 和 Grading 的预览体验

建议的修改步骤：
1. 先修复弹窗显示问题
2. 再处理 PreviewDialog 的集成
3. 最后优化交互体验
