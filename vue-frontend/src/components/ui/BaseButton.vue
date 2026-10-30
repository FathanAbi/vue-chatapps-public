<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * The one button primitive. Renders a native <button> (or <RouterLink> when
 * `to` is given) so that keyboard and screen-reader behaviour is inherited
 * rather than reimplemented.
 */
const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'ghost', 'danger'].includes(v),
  },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v),
  },
  type: { type: String, default: 'button' },
  to: { type: [String, Object], default: null },
  icon: { type: String, default: null },
  iconOnly: { type: Boolean, default: false },
  label: { type: String, default: null },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
})

const tag = computed(() => (props.to ? 'router-link' : 'button'))
const isDisabled = computed(() => props.disabled || props.loading)
const buttonType = computed(() => (props.to ? undefined : props.type))
const ariaLabel = computed(() => (props.iconOnly ? props.label : undefined))
const toProp = computed(() => (props.to ? { to: props.to } : {}))
</script>

<template>
  <component
    :is="tag"
    v-bind="toProp"
    :type="buttonType"
    :disabled="tag === 'button' ? isDisabled : undefined"
    :class="[
      'btn',
      `btn--${variant}`,
      `btn--${size}`,
      { 'btn--icon': iconOnly, 'btn--block': block },
    ]"
    :aria-label="ariaLabel"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" :size="size === 'sm' ? 16 : 18" />
    <span v-if="!iconOnly" class="btn__label"><slot /></span>
  </component>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: var(--fw-medium);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--transition),
    border-color var(--transition),
    color var(--transition);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--sm {
  height: 32px;
  padding: 0 var(--space-3);
  font-size: var(--fs-sm);
}
.btn--md {
  height: 40px;
  padding: 0 var(--space-4);
  font-size: var(--fs-base);
}
.btn--lg {
  height: 46px;
  padding: 0 var(--space-5);
  font-size: var(--fs-md);
}

.btn--primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
}
.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn--secondary {
  background: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-text);
}
.btn--secondary:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn--ghost {
  background: transparent;
  color: var(--color-text-muted);
}
.btn--ghost:hover:not(:disabled) {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.btn--danger {
  background: var(--color-danger);
  color: #fff;
}
.btn--danger:hover:not(:disabled) {
  background: var(--color-danger-hover);
}

.btn--icon {
  padding: 0;
  width: 40px;
}
.btn--icon.btn--sm {
  width: 32px;
}
.btn--icon.btn--lg {
  width: 46px;
}

.btn--block {
  width: 100%;
}

.btn__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: btn-spin 0.6s linear infinite;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
