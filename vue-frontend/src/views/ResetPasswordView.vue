<template>
  <div class="reset-container">
    <div class="reset-card">
      <h1 class="title">Reset Password</h1>
      <p class="subtitle">Choose a new password for your account.</p>

      <p v-if="!token" class="error-message">
        This reset link is missing its token. Please request a new one.
      </p>

      <form v-else-if="!done" @submit.prevent="submit" class="reset-form">
        <div class="form-group">
          <label for="password">New password</label>
          <input
            type="password"
            id="password"
            v-model="password"
            placeholder="At least 8 characters"
            minlength="8"
            required
          />
        </div>
        <div class="form-group">
          <label for="confirm">Confirm password</label>
          <input
            type="password"
            id="confirm"
            v-model="confirm"
            placeholder="Repeat the password"
            minlength="8"
            required
          />
        </div>
        <p v-if="error" class="error-message">{{ error }}</p>
        <button type="submit" class="reset-btn" :disabled="loading">
          {{ loading ? 'Saving…' : 'Set new password' }}
        </button>
      </form>

      <p v-else class="sent-message">
        Your password has been updated.
        <RouterLink to="/login" class="login-link">Sign in</RouterLink>
      </p>

      <p v-if="!done" class="login-text">
        <RouterLink to="/login" class="login-link">Back to login</RouterLink>
      </p>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      token: "",
      password: "",
      confirm: "",
      error: "",
      done: false,
      loading: false,
    };
  },
  created() {
    this.token = this.$route?.query?.token || "";
  },
  methods: {
    async submit() {
      this.error = "";

      if (this.password.length < 8) {
        this.error = "Password must be at least 8 characters long.";
        return;
      }

      if (this.password !== this.confirm) {
        this.error = "The passwords do not match.";
        return;
      }

      this.loading = true;
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_API_URL}/api/penggunas/reset-password`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: this.token,
              password: this.password,
            }),
          },
        );

        if (!resp.ok) {
          const message =
            (await resp.json())?.errors?.[0]?.message ||
            "This reset link is invalid or has expired.";
          this.error = message;
          return;
        }

        this.done = true;
      } catch {
        this.error = "Something went wrong. Please try again.";
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.reset-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #eef2ff, #f8fafc);
  font-family: "Inter", sans-serif;
}
.reset-card {
  background: white;
  padding: 2.5rem 2.8rem;
  border-radius: 1.2rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  width: 100%;
  max-width: 400px;
  text-align: center;
}
.title {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1e293b;
}
.subtitle {
  color: #64748b;
  margin-bottom: 2rem;
  font-size: 1rem;
}
.form-group {
  text-align: left;
  margin-bottom: 1.2rem;
}
label {
  display: block;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.4rem;
}
input {
  width: 100%;
  padding: 0.7rem 1rem;
  border-radius: 8px;
  border: 1.5px solid #cbd5e1;
  font-size: 1rem;
}
input:focus {
  outline: none;
  border-color: #3b82f6;
}
.reset-btn {
  width: 100%;
  background: #3b82f6;
  color: white;
  font-weight: 600;
  border: none;
  border-radius: 9999px;
  padding: 0.8rem;
  margin-top: 0.5rem;
  cursor: pointer;
}
.reset-btn:disabled {
  opacity: 0.7;
  cursor: default;
}
.error-message {
  color: #dc2626;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
.sent-message {
  color: #059669;
  margin-bottom: 1.5rem;
}
.login-text {
  margin-top: 1.5rem;
  font-size: 0.95rem;
  color: #475569;
}
.login-link {
  color: #3b82f6;
  font-weight: 600;
  text-decoration: none;
}
.login-link:hover {
  text-decoration: underline;
}
</style>
