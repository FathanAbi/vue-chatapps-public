<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from './layout/AuthLayout.vue'
import BaseInput from './ui/BaseInput.vue'
import BaseButton from './ui/BaseButton.vue'

const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const registered = ref(route.query.registered === '1')

async function login() {
  error.value = ''
  loading.value = true

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
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
      const errorMsg = body?.errors?.[0]?.message || `Login failed (${resp.status})`
      throw new Error(errorMsg)
    }

    if (!body) {
      throw new Error(
        'Server returned an empty response. Check VITE_API_URL and that the backend is running.',
      )
    }

    router.push('/dashboard')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout title="Welcome back" subtitle="Sign in to continue chatting">
    <p v-if="registered" class="auth-form__success" role="status">
      Account created. You can log in now.
    </p>

    <form class="auth-form" @submit.prevent="login">
      <BaseInput
        id="login-email"
        v-model="email"
        label="Email"
        type="email"
        placeholder="you@example.com"
        autocomplete="email"
        icon="user"
        required
      />
      <BaseInput
        id="login-password"
        v-model="password"
        label="Password"
        type="password"
        placeholder="Your password"
        autocomplete="current-password"
        required
      />

      <p v-if="error" class="auth-form__error" role="alert">{{ error }}</p>

      <BaseButton type="submit" size="lg" block :loading="loading">Log in</BaseButton>
    </form>

    <p class="auth-form__link">
      <RouterLink to="/forgot-password">Forgot password?</RouterLink>
    </p>

    <p class="auth-form__foot">
      Don’t have an account?
      <RouterLink to="/register">Register here</RouterLink>
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

.auth-form__success {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-success-soft);
  color: var(--color-success);
  font-size: var(--fs-sm);
  text-align: left;
}

.auth-form__link {
  margin-top: var(--space-4);
  font-size: var(--fs-sm);
}

.auth-form__foot {
  margin-top: var(--space-5);
  font-size: var(--fs-base);
  color: var(--color-text-muted);
}
</style>
