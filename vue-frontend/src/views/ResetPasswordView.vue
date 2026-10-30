<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import AuthLayout from '../components/layout/AuthLayout.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseButton from '../components/ui/BaseButton.vue'

const route = useRoute()

const token = ref(route.query.token || '')
const password = ref('')
const confirm = ref('')
const error = ref('')
const done = ref(false)
const loading = ref(false)

async function submit() {
  error.value = ''

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters long.'
    return
  }

  if (password.value !== confirm.value) {
    error.value = 'The passwords do not match.'
    return
  }

  loading.value = true
  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token.value,
        password: password.value,
      }),
    })

    if (!resp.ok) {
      error.value =
        (await resp.json())?.errors?.[0]?.message || 'This reset link is invalid or has expired.'
      return
    }

    done.value = true
  } catch {
    error.value = 'Something went wrong. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout title="Reset password" subtitle="Choose a new password for your account.">
    <p v-if="!token" class="auth-form__error" role="alert">
      This reset link is missing its token. Please request a new one.
    </p>

    <form v-else-if="!done" class="auth-form" @submit.prevent="submit">
      <BaseInput
        id="reset-password"
        v-model="password"
        label="New password"
        type="password"
        placeholder="At least 8 characters"
        autocomplete="new-password"
        minlength="8"
        required
      />
      <BaseInput
        id="reset-confirm"
        v-model="confirm"
        label="Confirm password"
        type="password"
        placeholder="Repeat the password"
        autocomplete="new-password"
        minlength="8"
        required
      />

      <p v-if="error" class="auth-form__error" role="alert">{{ error }}</p>

      <BaseButton type="submit" size="lg" block :loading="loading">Set new password</BaseButton>
    </form>

    <p v-else class="auth-form__note" role="status">
      Your password has been updated.
      <RouterLink to="/login">Sign in</RouterLink>
    </p>

    <p v-if="!done" class="auth-form__foot">
      <RouterLink to="/login">Back to login</RouterLink>
    </p>
  </AuthLayout>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  text-align: left;
}

.auth-form__error {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: var(--fs-sm);
}

.auth-form__note {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-success-soft);
  color: var(--color-success);
  font-size: var(--fs-sm);
}

.auth-form__foot {
  margin-top: var(--space-5);
  font-size: var(--fs-base);
  color: var(--color-text-muted);
}
</style>
