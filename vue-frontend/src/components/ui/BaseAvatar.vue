<script setup>
import { computed } from 'vue'

/**
 * Initials avatar. No image upload exists in the app, so the avatar is derived
 * from the display name and coloured deterministically from it.
 */
const props = defineProps({
  name: { type: String, default: '' },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
})

const PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777']

const initial = computed(() => props.name?.trim()?.charAt(0)?.toUpperCase() || '?')

const color = computed(() => {
  const key = props.name || '?'
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
})
</script>

<template>
  <span
    class="avatar"
    :class="`avatar--${size}`"
    :style="{ background: color }"
    :title="name || undefined"
    aria-hidden="true"
  >
    {{ initial }}
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 50%;
  color: #fff;
  font-weight: var(--fw-semibold);
  user-select: none;
}

.avatar--sm {
  width: 28px;
  height: 28px;
  font-size: var(--fs-xs);
}
.avatar--md {
  width: 36px;
  height: 36px;
  font-size: var(--fs-base);
}
.avatar--lg {
  width: 44px;
  height: 44px;
  font-size: var(--fs-lg);
}
</style>
