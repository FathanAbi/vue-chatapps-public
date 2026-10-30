<script setup>
import { computed, useId } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * Text input with an always-associated label and inline error/hint messaging,
 * so every form field in the app is labelled and announced consistently.
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  id: { type: String, default: null },
  label: { type: String, default: null },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  error: { type: String, default: null },
  hint: { type: String, default: null },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  autocomplete: { type: String, default: null },
  minlength: { type: [String, Number], default: null },
  icon: { type: String, default: null },
})

defineEmits(['update:modelValue'])

const generatedId = useId()
const inputId = computed(() => props.id || `field-${generatedId}`)
const describedBy = computed(() => {
  const ids = []
  if (props.error) ids.push(`${inputId.value}-error`)
  if (props.hint) ids.push(`${inputId.value}-hint`)
  return ids.length ? ids.join(' ') : undefined
})
</script>

<template>
  <div class="field">
    <label v-if="label" :for="inputId" class="field__label">
      {{ label }}<span v-if="required" class="field__req" aria-hidden="true">*</span>
    </label>

    <div class="field__control" :class="{ 'field__control--error': !!error }">
      <AppIcon v-if="icon" :name="icon" :size="18" class="field__icon" />
      <input
        :id="inputId"
        class="field__input"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :autocomplete="autocomplete || undefined"
        :minlength="minlength || undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </div>

    <p v-if="error" :id="`${inputId}-error`" class="field__error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="`${inputId}-hint`" class="field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  text-align: left;
}

.field__label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  color: var(--color-text);
}

.field__req {
  color: var(--color-danger);
  margin-left: 2px;
}

.field__control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 42px;
  padding: 0 var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  transition:
    border-color var(--transition),
    box-shadow var(--transition);
}

.field__control:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}

.field__control--error {
  border-color: var(--color-danger);
}

.field__icon {
  color: var(--color-text-subtle);
  flex: 0 0 auto;
}

.field__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  outline: none;
  font-size: var(--fs-base);
}

.field__input::placeholder {
  color: var(--color-text-subtle);
}

.field__error {
  font-size: var(--fs-sm);
  color: var(--color-danger);
}

.field__hint {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}
</style>
