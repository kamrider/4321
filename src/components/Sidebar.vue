<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits(['menu-click'])

const isCollapsed = ref(false)

const menuItems = [
  { 
    icon: '📝', 
    label: '上传错题', 
    route: '/upload' 
  },
  { 
    icon: '📚', 
    label: '我的错题', 
    route: '/mistakes' 
  },
  { 
    icon: '📖', 
    label: '训练内容', 
    route: '/training' 
  },
  { 
    icon: '⚙️', 
    label: '设置', 
    route: '/settings' 
  }
]

const handleMenuClick = (route: string) => {
  emit('menu-click', route)
}

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="sidebar" :class="{ 'collapsed': isCollapsed }">
    <div class="menu-items">
      <router-link
        v-for="item in menuItems"
        :key="item.label"
        :to="item.route"
        class="menu-item"
        :title="isCollapsed ? item.label : ''"
        active-class="active"
      >
        <span class="icon">{{ item.icon }}</span>
        <span class="label" v-show="!isCollapsed">{{ item.label }}</span>
      </router-link>
    </div>
    
    <div class="toggle-btn" @click="toggleSidebar">
      {{ isCollapsed ? '→' : '←' }}
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  background: #2c3e50;
  color: white;
  height: 100vh;
  width: 240px;
  transition: all 0.3s ease;
  position: fixed;
  left: 0;
  top: 0;
  display: flex;
  flex-direction: column;
}

.collapsed {
  width: 60px;
}

.toggle-btn {
  position: absolute;
  right: -30px;
  top: 50%;
  transform: translateY(-50%);
  background: #2c3e50;
  color: white;
  width: 30px;
  height: 60px;
  border-radius: 0 8px 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 18px;
}

.toggle-btn:hover {
  background: #34495e;
  width: 35px;
  right: -35px;
}

.menu-items {
  padding: 20px 0;
  flex: 1;
}

.menu-item {
  padding: 15px 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.menu-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 3px;
  background: transparent;
  transition: all 0.3s ease;
}

.menu-item:hover {
  background: #34495e;
}

.menu-item:hover::before {
  background: #42b883;
}

.icon {
  font-size: 24px;
  margin-right: 15px;
  transition: all 0.3s ease;
}

.menu-item:hover .icon {
  transform: scale(1.1);
}

.label {
  font-size: 16px;
  white-space: nowrap;
  opacity: 1;
  transition: all 0.3s ease;
}

.collapsed .label {
  opacity: 0;
}

.active {
  background: #34495e;
}

.active .icon {
  color: #42b983;
}
</style> 