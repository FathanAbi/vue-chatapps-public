<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthLayout from './layout/AuthLayout.vue'
import BaseInput from './ui/BaseInput.vue'
import BaseButton from './ui/BaseButton.vue'

const router = useRouter()

const username = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function register() {
  error.value = ''
  loading.value = true

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        username: username.value,
      }),
    })

    const text = await resp.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }

    if (!resp.ok) {
      const errorMsg = body?.errors?.[0]?.message || `Registration failed (${resp.status})`
      throw new Error(errorMsg)
    }

    if (!body) {
      throw new Error(
        'Server returned an empty response. Check VITE_API_URL and that the backend is running.',
      )
    }

    router.push({ name: 'login', query: { registered: '1' } })
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout title="Create account" subtitle="Join the conversation and start chatting">
    <form class="auth-form" @submit.prevent="register">
      <BaseInput
        id="register-username"
        v-model="username"
        label="Username"
        placeholder="your_username"
        autocomplete="username"
        hint="3–24 characters: lowercase letters, numbers, underscore."
        required
      />
      <BaseInput
        id="register-email"
        v-model="email"
        label="Email"
        type="email"
        placeholder="you@example.com"
        autocomplete="email"
        icon="user"
        required
      />
      <BaseInput
        id="register-password"
        v-model="password"
        label="Password"
        type="password"
        placeholder="At least 8 characters"
        autocomplete="new-password"
        required
      />

      <p v-if="error" class="auth-form__error" role="alert">{{ error }}</p>

      <BaseButton type="submit" size="lg" block :loading="loading">Register</BaseButton>
    </form>

    <p class="auth-form__foot">
      Already have an account?
      <RouterLink to="/login">Log in here</RouterLink>
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

.auth-form__foot {
  margin-top: var(--space-5);
  font-size: var(--fs-base);
  color: var(--color-text-muted);
}
</style>
