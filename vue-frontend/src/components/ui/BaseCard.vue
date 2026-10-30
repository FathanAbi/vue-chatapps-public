<script setup>
/**
 * Neutral surface container with a consistent border, radius and shadow.
 */
defineProps({
  as: { type: String, default: 'div' },
  interactive: { type: Boolean, default: false },
  padded: { type: Boolean, default: true },
  active: { type: Boolean, default: false },
})
</script>

<template>
  <component
    :is="as"
    class="card"
    :class="{ 'card--interactive': interactive, 'card--padded': padded, 'card--active': active }"
  >
    <slot />
  </component>
</template>

<style scoped>
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.card--padded {
  padding: var(--space-5);
}

.card--interactive {
  cursor: pointer;
  transition:
    border-color var(--transition),
    box-shadow var(--transition),
    transform var(--transition-fast);
}

.card--interactive:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
}

.card--active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
</style>
