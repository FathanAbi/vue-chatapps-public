<template>
  <div class="home-container">
    <header class="home-header">
      <h1 class="logo">VueChat 💬</h1>

      <button class="menu-toggle" @click="toggleMenu">
        ☰
      </button>

      <div class="auth-buttons" :class="{ open: menuOpen }">
        <RouterLink to="/login" class="btn login-btn">Login</RouterLink>
        <RouterLink to="/register" class="btn register-btn">Register</RouterLink>
      </div>
    </header>

    <main class="home-main">
      <div class="intro">
        <h2>Connect. Chat. Collaborate.</h2>
        <p>
          Join public or private channels, chat with friends, and build communities — all in one place.
        </p>
        <RouterLink to="/login" class="btn start-btn">Get Started</RouterLink>
      </div>

      <!-- Optional illustration -->
      <!-- <div class="illustration">
        <img src="/chat-illustration.svg" alt="Chat illustration" />
      </div> -->
    </main>

    <footer class="home-footer">
      <p>© {{ new Date().getFullYear() }} VueChat. All rights reserved.</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const menuOpen = ref(false)
const toggleMenu = () => (menuOpen.value = !menuOpen.value)
</script>

<style scoped>
/* General layout */
.home-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: linear-gradient(135deg, #eef2ff, #f8fafc);
  color: #1e293b;
  font-family: 'Inter', sans-serif;
}

/* Header */
.home-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.2rem 2rem;
  background: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  position: relative;
}

.logo {
  font-size: 1.8rem;
  font-weight: 700;
  color: #3b82f6;
  white-space: nowrap;
}

/* Auth buttons */
.auth-buttons {
  display: flex;
  gap: 1rem;
  transition: all 0.3s ease;
}

.btn {
  padding: 0.6rem 1.4rem;
  border-radius: 9999px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.25s ease;
}

.login-btn {
  border: 2px solid #3b82f6;
  color: #3b82f6;
}
.login-btn:hover {
  background: #3b82f6;
  color: white;
}

.register-btn {
  background: #3b82f6;
  color: white;
}
.register-btn:hover {
  background: #2563eb;
}

/* Mobile menu toggle */
.menu-toggle {
  display: none;
  font-size: 1.5rem;
  background: none;
  border: none;
  color: #1e293b;
  cursor: pointer;
}

/* Main section */
.home-main {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  padding: 3rem 6rem;
  gap: 3rem;
}

.intro {
  flex: 1;
}

.intro h2 {
  font-size: 2.6rem;
  margin-bottom: 1rem;
  color: #1e293b;
  line-height: 1.2;
}

.intro p {
  font-size: 1.1rem;
  color: #475569;
  margin-bottom: 2rem;
  max-width: 500px;
}

.start-btn {
  background: #3b82f6;
  color: white;
  border-radius: 9999px;
  padding: 0.8rem 2rem;
  font-weight: 600;
}
.start-btn:hover {
  background: #2563eb;
}

.illustration {
  flex: 1;
  display: flex;
  justify-content: center;
}
.illustration img {
  width: 90%;
  max-width: 500px;
}

/* Footer */
.home-footer {
  text-align: center;
  padding: 1.5rem;
  font-size: 0.9rem;
  color: #64748b;
}

/* ---------- RESPONSIVE STYLES ---------- */

/* Tablets and small desktops */
@media (max-width: 1024px) {
  .home-main {
    padding: 2.5rem 3rem;
  }

  .intro h2 {
    font-size: 2.2rem;
  }

  .intro p {
    font-size: 1rem;
  }
}

/* Mobile layout */
@media (max-width: 768px) {
  .home-header {
    padding: 1rem 1.5rem;
  }

  .menu-toggle {
    display: block;
  }

  .auth-buttons {
    display: none;
    flex-direction: column;
    position: absolute;
    top: 100%;
    right: 1rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
    padding: 1rem;
  }

  .auth-buttons.open {
    display: flex;
  }

  .home-main {
    flex-direction: column;
    text-align: center;
    padding: 2rem 1.5rem;
  }

  .intro h2 {
    font-size: 2rem;
  }

  .intro p {
    font-size: 1rem;
    max-width: none;
  }

  .illustration img {
    width: 80%;
    margin-top: 2rem;
  }
}

/* Extra small devices */
@media (max-width: 480px) {
  .logo {
    font-size: 1.5rem;
  }

  .intro h2 {
    font-size: 1.7rem;
  }

  .btn {
    padding: 0.5rem 1.2rem;
    font-size: 0.9rem;
  }
}
</style>
