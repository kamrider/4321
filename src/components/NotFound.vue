<template>
  <div class="not-found">
    <h2>404 - 页面未找到</h2>
    <p>抱歉，您访问的页面不存在。</p>
    <router-link to="/upload" class="back-btn">返回首页</router-link>
  </div>
</template>

<style scoped>
.not-found {
  text-align: center;
  padding: 40px;
}

.back-btn {
  display: inline-block;
  margin-top: 20px;
  padding: 8px 16px;
  background: #2c3e50;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  transition: background 0.3s;
}

.back-btn:hover {
  background: #34495e;
}
</style> 