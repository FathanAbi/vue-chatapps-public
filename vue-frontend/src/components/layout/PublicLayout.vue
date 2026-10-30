<script setup>
import AppIcon from '../ui/AppIcon.vue'
import BaseButton from '../ui/BaseButton.vue'

/**
 * Marketing shell for the public routes (landing + about). Header with the
 * brand and auth entry points; footer with a copyright line.
 */
</script>

<template>
  <div class="public">
    <header class="public__header">
      <RouterLink to="/" class="public__brand">
        <span class="public__logo" aria-hidden="true"><AppIcon name="message" :size="18" /></span>
        <span class="public__brand-name">VueChat</span>
      </RouterLink>

      <nav class="public__nav" aria-label="Account">
        <BaseButton to="/login" variant="secondary" size="sm">Log in</BaseButton>
        <BaseButton to="/register" variant="primary" size="sm">Register</BaseButton>
      </nav>
    </header>

    <main class="public__main">
      <slot />
    </main>

    <footer class="public__footer">
      <p>© {{ new Date().getFullYear() }} VueChat. All rights reserved.</p>
    </footer>
  </div>
</template>

<style scoped>
.public {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-bg);
}

.public__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: var(--header-h);
  padding: 0 var(--space-6);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.public__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-weight: var(--fw-bold);
}
.public__brand:hover {
  text-decoration: none;
}

.public__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.public__brand-name {
  font-size: var(--fs-lg);
}

.public__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.public__main {
  flex: 1;
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}

.public__footer {
  padding: var(--space-5) var(--space-6);
  border-top: 1px solid var(--color-border);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--fs-sm);
}

@media (max-width: 480px) {
  .public__header,
  .public__main,
  .public__footer {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
  .public__main {
    padding-top: var(--space-6);
    padding-bottom: var(--space-6);
  }
}
</style>
