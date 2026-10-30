<script setup>
import { ref } from 'vue'
import AuthLayout from '../components/layout/AuthLayout.vue'
import BaseInput from '../components/ui/BaseInput.vue'
import BaseButton from '../components/ui/BaseButton.vue'

const email = ref('')
const sent = ref(false)
const loading = ref(false)

async function submit() {
  loading.value = true
  try {
    await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/forgot-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value }),
    })
    // Always show the same confirmation regardless of the response, so the
    // endpoint cannot be used to enumerate registered accounts.
    sent.value = true
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout title="Forgot password" subtitle="Enter your email and we'll send you a reset link.">
    <form v-if="!sent" class="auth-form" @submit.prevent="submit">
      <BaseInput
        id="forgot-email"
        v-model="email"
        label="Email"
        type="email"
        placeholder="you@example.com"
        autocomplete="email"
        icon="user"
        required
      />
      <BaseButton type="submit" size="lg" block :loading="loading">Send reset link</BaseButton>
    </form>

    <p v-else class="auth-form__note" role="status">
      If an account exists for that email, a reset link has been sent. Check your inbox.
    </p>

    <p class="auth-form__foot">
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
