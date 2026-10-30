<script setup>
import AppIcon from '../ui/AppIcon.vue'

/**
 * Centered card shell for the unauthenticated screens (login, register,
 * forgot/reset password). Keeps the auth surface visually separate from the
 * main application shell.
 */
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: null },
})
</script>

<template>
  <div class="auth">
    <div class="auth__card">
      <RouterLink to="/" class="auth__brand">
        <span class="auth__logo" aria-hidden="true"><AppIcon name="message" :size="20" /></span>
        <span class="auth__brand-name">VueChat</span>
      </RouterLink>

      <h1 class="auth__title">{{ title }}</h1>
      <p v-if="subtitle" class="auth__subtitle">{{ subtitle }}</p>

      <slot />
    </div>
  </div>
</template>

<style scoped>
.auth {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: var(--space-5);
  background: var(--color-bg);
}

.auth__card {
  width: 100%;
  max-width: 400px;
  padding: var(--space-7) var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  text-align: center;
}

.auth__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
  color: var(--color-text);
  font-weight: var(--fw-bold);
}
.auth__brand:hover {
  text-decoration: none;
}

.auth__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.auth__brand-name {
  font-size: var(--fs-lg);
}

.auth__title {
  font-size: var(--fs-2xl);
  font-weight: var(--fw-bold);
}

.auth__subtitle {
  margin-top: var(--space-2);
  margin-bottom: var(--space-6);
  color: var(--color-text-muted);
}

@media (max-width: 480px) {
  .auth__card {
    padding: var(--space-6) var(--space-5);
  }
  .auth__title {
    font-size: var(--fs-xl);
  }
}
</style>
