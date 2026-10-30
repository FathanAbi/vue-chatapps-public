<script setup>
/**
 * Small status label used for joined/owner/state chips.
 */
defineProps({
  variant: {
    type: String,
    default: 'neutral',
    validator: (v) => ['neutral', 'primary', 'success', 'warning', 'danger', 'info'].includes(v),
  },
})
</script>

<template>
  <span class="badge" :class="`badge--${variant}`"><slot /></span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  line-height: 1.4;
  white-space: nowrap;
}

.badge--neutral {
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}
.badge--primary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.badge--success {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.badge--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.badge--danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.badge--info {
  background: var(--color-info-soft);
  color: var(--color-info);
}
</style>
