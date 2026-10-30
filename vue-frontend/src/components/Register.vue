<template>
  <div class="register-container">
    <div class="register-card">
      <h1 class="title">Create Account ✨</h1>
      <p class="subtitle">Join the conversation and start chatting</p>

      <form @submit.prevent="register" class="register-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input
            type="text"
            id="username"
            v-model="username"
            placeholder="Enter your username"
            required
          />
        </div>

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

        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            v-model="password"
            placeholder="Enter your password"
            required
          />
        </div>

        <button type="submit" class="register-btn">Register</button>
      </form>

      <p class="login-text">
        Already have an account?
        <RouterLink to="/login" class="login-link">Login here</RouterLink>
      </p>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      email: "",
      password: "",
      username: "",
    };
  },
  methods: {
    async register() {
      try {
        const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: this.email,
            password: this.password,
            username: this.username,
          }),
        });

        const text = await resp.text();
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = null;
        }

        if (!resp.ok) {
          const errorMsg = body?.errors?.[0]?.message || `Registration failed (${resp.status})`;
          throw new Error(errorMsg);
        }

        if (!body) {
          throw new Error(
            "Server returned an empty response. Check VITE_API_URL and that the backend is running.",
          );
        }

        console.log(body);

        alert("User created successfully!");
        this.$router.push("/login");
      } catch (error) {
        alert(error.message);
      }
    },
  },
};
</script>

<style scoped>
.register-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #eef2ff, #f8fafc);
  font-family: "Inter", sans-serif;
}

.register-card {
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
  transition: border-color 0.2s ease;
}

input:focus {
  outline: none;
  border-color: #3b82f6;
}

.register-btn {
  width: 100%;
  background: #10b981;
  color: white;
  font-weight: 600;
  border: none;
  border-radius: 9999px;
  padding: 0.8rem;
  margin-top: 0.5rem;
  cursor: pointer;
  transition: background 0.25s ease;
}

.register-btn:hover {
  background: #059669;
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

/* Mobile responsive */
@media (max-width: 480px) {
  .register-card {
    margin: 1.5rem;
    padding: 2rem 1.8rem;
  }

  .title {
    font-size: 1.5rem;
  }
}
</style>
