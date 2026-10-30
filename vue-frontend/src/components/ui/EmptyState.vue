<script setup>
import AppIcon from './AppIcon.vue'

/**
 * Shared empty / zero-data state so every "nothing here yet" screen looks and
 * reads the same.
 */
defineProps({
  icon: { type: String, default: 'message' },
  title: { type: String, default: null },
  text: { type: String, default: null },
})
</script>

<template>
  <div class="empty">
    <span class="empty__icon"><AppIcon :name="icon" :size="24" /></span>
    <p v-if="title" class="empty__title">{{ title }}</p>
    <p v-if="text" class="empty__text">{{ text }}</p>
    <div v-if="$slots.default" class="empty__actions"><slot /></div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-7) var(--space-5);
  text-align: center;
  color: var(--color-text-muted);
}

.empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-surface-2);
  color: var(--color-text-subtle);
  margin-bottom: var(--space-1);
}

.empty__title {
  font-weight: var(--fw-semibold);
  color: var(--color-text);
}

.empty__text {
  font-size: var(--fs-sm);
  max-width: 42ch;
}

.empty__actions {
  margin-top: var(--space-3);
}
</style>
