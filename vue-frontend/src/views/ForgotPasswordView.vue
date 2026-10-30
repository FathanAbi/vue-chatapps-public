<template>
  <div class="reset-container">
    <div class="reset-card">
      <h1 class="title">Forgot Password</h1>
      <p class="subtitle">Enter your email and we'll send you a reset link.</p>

      <form v-if="!sent" @submit.prevent="submit" class="reset-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            v-model="email"
            placeholder="Enter your email"
            required
          />
        </div>
        <button type="submit" class="reset-btn" :disabled="loading">
          {{ loading ? 'Sending…' : 'Send reset link' }}
        </button>
      </form>

      <p v-else class="sent-message">
        If an account exists for that email, a reset link has been sent. Check
        your inbox.
      </p>

      <p class="login-text">
        <RouterLink to="/login" class="login-link">Back to login</RouterLink>
      </p>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      email: "",
      sent: false,
      loading: false,
    };
  },
  methods: {
    async submit() {
      this.loading = true;
      try {
        await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/forgot-password`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.email }),
        });
        // Always show the same confirmation regardless of the response, so the
        // endpoint cannot be used to enumerate registered accounts.
        this.sent = true;
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
