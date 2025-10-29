<template>
  <div class="login-container">
    <div class="login-card">
      <h1 class="title">Welcome Back 👋</h1>
      <p class="subtitle">Sign in to continue chatting</p>

      <form @submit.prevent="login" class="login-form">
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

        <button type="submit" class="login-btn">Login</button>
      </form>

      <p class="register-text">
        Don’t have an account?
        <RouterLink to="/register" class="register-link">Register here</RouterLink>
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
    };
  },
  methods: {
    async login() {
      try {
        const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/login`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: this.email,
            password: this.password,
          }),
        });

        if (!resp.ok) {
          const errorMsg = (await resp.json())?.errors?.[0]?.message || "Login failed";
          throw new Error(errorMsg);
        }

        const response = await resp.json();
        console.log(response);

        this.$router.push("/dashboard");
      } catch (error) {
        alert(error.message);
      }
    },
  },
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #eef2ff, #f8fafc);
  font-family: "Inter", sans-serif;
}

.login-card {
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

.login-btn {
  width: 100%;
  background: #3b82f6;
  color: white;
  font-weight: 600;
  border: none;
  border-radius: 9999px;
  padding: 0.8rem;
  margin-top: 0.5rem;
  cursor: pointer;
  transition: background 0.25s ease;
}

.login-btn:hover {
  background: #2563eb;
}

.register-text {
  margin-top: 1.5rem;
  font-size: 0.95rem;
  color: #475569;
}

.register-link {
  color: #3b82f6;
  font-weight: 600;
  text-decoration: none;
}

.register-link:hover {
  text-decoration: underline;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .login-card {
    margin: 1.5rem;
    padding: 2rem 1.8rem;
  }

  .title {
    font-size: 1.5rem;
  }
}
</style>
