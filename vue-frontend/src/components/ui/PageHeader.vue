<script setup>
/**
 * Standard page heading: title, optional description and an actions area.
 * Used inside the app-shell content region so every page starts identically.
 */
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: null },
})
</script>

<template>
  <div class="page-header">
    <div class="page-header__text">
      <h1 class="page-header__title">{{ title }}</h1>
      <p v-if="description" class="page-header__desc">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin-bottom: var(--space-5);
}

.page-header__title {
  font-size: var(--fs-2xl);
  font-weight: var(--fw-bold);
}

.page-header__desc {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--fs-base);
  max-width: 60ch;
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
}
</style>
