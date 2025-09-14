<template>
  <div class="login-container">
    <!-- 浮动背景元素 -->
    <div class="background">
      <div class="float-circle circle1"></div>
      <div class="float-circle circle2"></div>
      <div class="float-circle circle3"></div>
      <div class="float-circle circle4"></div>
    </div>
    
    <div class="login-card">
      <!-- 左侧装饰 -->
      <div class="decoration">
        <div class="logo-container">
          <div class="logo-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
        </div>
        <h1 class="welcome">欢迎回来</h1>
        <p class="subtitle">请登录您的账号继续访问</p>
        <div class="waves">
          <div class="wave wave1"></div>
          <div class="wave wave2"></div>
          <div class="wave wave3"></div>
        </div>
      </div>
      
      <!-- 右侧登录表单 -->
      <div class="form-section">
        <h2 class="form-title">账户登录</h2>
        <div class="message-box" :class="messageClass" v-if="showMessage" @click="showMessage = false">
          <span>{{ messageText }}</span>
        </div>
        <form @submit.prevent="handleLogin"> 
            <div class="form-group" :class="{ 'focused': usernameFocused || username !== '' }">
                <label for="username">用户名</label>
                <input 
                type="text" 
                id="username" 
                v-model="username"
                @focus="usernameFocused = true"
                @blur="usernameFocused = false"
                >
            </div>
            
            <div class="form-group" :class="{ 'focused': passwordFocused || password !== '' }">
                <label for="password">密码</label>
                <input 
                type="password" 
                id="password" 
                v-model="password"
                @focus="passwordFocused = true"
                @blur="passwordFocused = false"
                >
            </div>
          <button class="login-btn" :disabled="loading">
            <span v-if="!loading">登录</span>
            <div v-else class="spinner">
              <div class="bounce1"></div>
              <div class="bounce2"></div>
              <div class="bounce3"></div>
            </div>
          </button>
        </form>
        <div class="footer-links">
          <a href="#">忘记密码?</a>
          <NuxtLink to="/register">注册新账号</NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()

// 1. 在 <script setup> 顶层安全调用
const { login, isLoggedIn } = useAuth()

// 2. 如果已经登录，直接跳转
if (isLoggedIn.value) {
  // 注意：<script setup> 里要用 await 或者 .then
  router.replace('/')
}

// 3. 登录表单的响应式状态
const username = ref('')
const password = ref('')
const loading = ref(false)
const showMessage = ref(false)
const messageText = ref('')
const messageClass = ref('')
const usernameFocused = ref(false)
const passwordFocused = ref(false)


// … 其余你之前的 handleLogin、showNotification、setCookie 方法同样直接写在这里 …


async function handleLogin() {
  if (!username.value) {
    return showNotification('请输入用户名', 'error')
  }
  if (!password.value) {
    return showNotification('请输入密码', 'error')
  }
  loading.value = true
  try {
    const result = await login(username.value,password.value)
    
    if (result.success) {
      showNotification('登录成功，正在跳转...', 'success')
      setTimeout(() => router.push('/'), 1000)
    } else {
      showNotification('登录失败!', 'error')
    }
  } catch (e : any) {
    console.error(e)
    showNotification('登录失败，' + e.data?.message || '请重试', 'error')
  } finally {
    loading.value = false
  }
}

function showNotification(text: string, type: string) {
  messageText.value = text
  messageClass.value = type
  showMessage.value = true
  setTimeout(() => (showMessage.value = false), type === 'error' ? 3000 : 5000)
}

/*function setCookie(name: string, value: string, days: number) {
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`
}*/
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #0c7ceb, #4436df, #9a29dc);
  overflow: hidden;
  position: relative;
  padding: 20px;
}

.background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.float-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  animation: float 15s infinite linear;
}

.circle1 {
  width: 250px;
  height: 250px;
  top: 10%;
  left: 5%;
  animation-delay: 0s;
}

.circle2 {
  width: 150px;
  height: 150px;
  top: 60%;
  left: 85%;
  animation-delay: -5s;
}

.circle3 {
  width: 200px;
  height: 200px;
  top: 80%;
  left: 15%;
  animation-delay: -10s;
}

.circle4 {
  width: 100px;
  height: 100px;
  top: 20%;
  left: 70%;
  animation-delay: -7s;
}

.login-card {
  display: flex;
  width: 900px;
  height: 550px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 20px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 10;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.login-card:hover {
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
  transform: translateY(-5px);
}

.decoration {
  flex: 1;
  background: linear-gradient(135deg, #1d1ac3, #2065b3);
  padding: 40px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: rgb(236, 254, 255);
  transform: translateZ(0); /* 开启硬件加速 */
  -webkit-transform-style: preserve-3d;
  -moz-transform-style: preserve-3d;
  transform-style: preserve-3d;
}

.logo-container {
  margin-bottom: 30px;
}

.logo-circle {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  justify-content: center;
  align-items: center;
  animation: pulse 3s infinite;
}

.logo-circle svg {
  width: 60px;
  height: 60px;
  color: white;
}

.welcome {
  font-size: 32px;
  font-weight: 600;
  margin-top: 20px;
  text-align: center;
}

.subtitle {
  font-size: 16px;
  opacity: 0.9;
  max-width: 80%;
  text-align: center;
  margin-top: 10px;
}



@keyframes wave {
  0% {
    transform: translateX(0) translateZ(0);
  }
  50% {
    transform: translateX(-25%) translateZ(0);
  }
  100% {
    transform: translateX(-50%) translateZ(0);
  }
}

/* 修改 waves 和 wave 相关的 CSS */
.waves {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 200px; /* 增加高度以适应不同高度的波浪 */
  overflow: hidden;
}

.wave {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 300%;
  height: 100%;
  background-repeat: repeat-x;
  background-position: 0 bottom;
  transform-origin: center bottom;
}

/* 为每个波浪设置不同的 SVG 图案 */
.wave1 {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 88.7'%3E%3Cpath d='M800 56.9c-155.5 0-204.9-50-405.5-49.9-200 0-250 49.9-394.5 49.9v31.8h800v-.2-31.6z' fill='%23ffffff'/%3E%3C/svg%3E");
  background-size: 50% 120px;
  bottom: 0;
  opacity: 0.5;
  z-index: 3;
}

.wave2 {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 88.7'%3E%3Cpath d='M800 36.9c-155.5 0-204.9-30-405.5-29.9-200 0-250 29.9-394.5 29.9v51.8h800v-.2-51.6z' fill='%23ffffff'/%3E%3C/svg%3E");
  background-size: 50% 180px;
  bottom: -31px;
  opacity: 0.4;
  z-index: 2;
}

.wave3 {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 88.7'%3E%3Cpath d='M800 76.9c-155.5 0-204.9-70-405.5-69.9-200 0-250 69.9-394.5 69.9v11.8h800v-.2-11.6z' fill='%23ffffff'/%3E%3C/svg%3E");
  background-size: 50% 200px;
  bottom: -40px;
  opacity: 0.3;
  z-index: 1;
}

/* 调整波浪动画速度和时间 */
.wave1 {
  animation: wave 8s infinite linear;
}

.wave2 {
  animation: wave 12s infinite linear;
}

.wave3 {
  animation: wave 16s infinite linear;
}

.form-section {
  flex: 1;
  padding: 50px 60px;
  display: flex;
  flex-direction: column;
}

.form-title {
  font-size: 26px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #551ac3;
}

.message-box {
  padding: 12px 20px;
  border-radius: 10px;
  color: white;
  margin: 15px 0;
  cursor: pointer;
  transition: transform 0.3s ease, opacity 0.3s ease;
  animation: slideIn 0.5s ease;
}

.message-box:hover {
  transform: scale(0.98);
}

.message-box.error {
  background: rgba(231, 76, 60, 0.9);
}

.message-box.success {
  background: rgba(46, 204, 113, 0.9);
}

.form-group {
  position: relative;
  margin: 25px 0;
}

.form-group label {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  font-size: 16px;
  color: #7f8c8d;
  transition: all 0.3s ease;
  pointer-events: none;
  padding: 0 5px;
}

.form-group.focused label,
.form-group input:focus + label,
.form-group input:not(:placeholder-shown) + label {
  top: 0;
  transform: translateY(-50%) scale(0.9);
  background: white;
  color: #1a69c3;
}

.form-group input {
  width: 100%;
  padding: 15px 15px;
  font-size: 16px;
  border: 2px solid #ecf0f1;
  border-radius: 10px;
  background: rgba(236, 240, 241, 0.3);
  outline: none;
  transition: all 0.3s ease;
}

.form-group input:focus {
  border-color: #301ac3;
  box-shadow: 0 0 0 2px rgba(26, 130, 195, 0.2);
}

.login-btn {
  background: linear-gradient(135deg, #1a96c3, #204fb3);
  color: white;
  border: none;
  padding: 16px;
  font-size: 18px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  width: 100%;
  margin-top: 10px;
}

.login-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 7px 15px rgba(26, 130, 195, 0.3);
  background: linear-gradient(135deg, #1a71c3, #2520b3);
  transition: all 0.3s ease;
}

.login-btn:disabled {
  background: linear-gradient(135deg, #95a5a6, #7f8c8d);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.footer-links {
  display: flex;
  justify-content: space-between;
  margin-top: 30px;
}

.footer-links a {
  text-decoration: none;
  color: #1a82c3;
  font-weight: 500;
  transition: all 0.3s ease;
}

.footer-links a:hover {
  color: #20b3aa;
  transform: translateX(3px);
}

/* Spinner */
.spinner {
  margin: 0 auto;
  width: 80px;
  text-align: center;
}

.spinner > div {
  width: 12px;
  height: 12px;
  background-color: white;
  border-radius: 100%;
  display: inline-block;
  animation: bouncedelay 1.4s infinite ease-in-out both;
}

.spinner .bounce1 {
  animation-delay: -0.32s;
}

.spinner .bounce2 {
  animation-delay: -0.16s;
}

@keyframes pulse {
      0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.3);
      }
      70% {
        transform: scale(1.05);
        box-shadow: 0 0 0 15px rgba(255, 255, 255, 0);
      }
      100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
      }
    }
@keyframes bouncedelay {
  0%, 80%, 100% { 
    transform: scale(0);
  }
  40% { 
    transform: scale(1.0);
  }
}

/* Animations */
@keyframes float {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  25% {
    transform: translate(10px, 15px) rotate(90deg);
  }
  50% {
    transform: translate(20px, 5px) rotate(180deg);
  }
  75% {
    transform: translate(10px, 15px) rotate(270deg);
  }
  100% {
    transform: translate(0, 0) rotate(360deg);
  }
}



@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .login-card {
    flex-direction: column;
    height: auto;
    width: 100%;
    max-width: 500px;
  }
  
  .decoration {
    padding: 30px;
  }
  
  .form-section {
    padding: 30px;
  }
  
  .logo-circle {
    width: 80px;
    height: 80px;
  }
  
  .logo-circle svg {
    width: 40px;
    height: 40px;
  }
}
</style>