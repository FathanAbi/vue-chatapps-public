<script setup>
import PublicLayout from '../components/layout/PublicLayout.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import AppIcon from '../components/ui/AppIcon.vue'

const features = [
  {
    icon: 'hash',
    title: 'Channels',
    text: 'Create public channels, join the ones you care about, and chat in real time.',
  },
  {
    icon: 'message',
    title: 'Direct messages',
    text: 'Find people by username and start a private one-to-one conversation.',
  },
  {
    icon: 'users',
    title: 'Simple by design',
    text: 'No clutter — just registration, channels and conversations that work.',
  },
]
</script>

<template>
  <PublicLayout>
    <section class="hero">
      <h1 class="hero__title">Connect. Chat. Collaborate.</h1>
      <p class="hero__lead">
        Join public channels, chat with friends, and build communities — all in one place.
      </p>
      <div class="hero__actions">
        <BaseButton to="/register" size="lg">Get started</BaseButton>
        <BaseButton to="/login" variant="secondary" size="lg">Log in</BaseButton>
      </div>
    </section>

    <section class="features">
      <article v-for="feature in features" :key="feature.title" class="feature">
        <span class="feature__icon" aria-hidden="true">
          <AppIcon :name="feature.icon" :size="22" />
        </span>
        <h2 class="feature__title">{{ feature.title }}</h2>
        <p class="feature__text">{{ feature.text }}</p>
      </article>
    </section>
  </PublicLayout>
</template>

<style scoped>
.hero {
  max-width: 640px;
  margin: 0 auto var(--space-8);
  text-align: center;
}

.hero__title {
  font-size: var(--fs-3xl);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
}

.hero__lead {
  margin-top: var(--space-4);
  font-size: var(--fs-lg);
  color: var(--color-text-muted);
}

.hero__actions {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-6);
  flex-wrap: wrap;
}

.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-5);
}

.feature {
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.feature__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  margin-bottom: var(--space-4);
}

.feature__title {
  font-size: var(--fs-lg);
  margin-bottom: var(--space-2);
}

.feature__text {
  color: var(--color-text-muted);
  font-size: var(--fs-base);
}

@media (max-width: 768px) {
  .features {
    grid-template-columns: 1fr;
  }
  .hero__title {
    font-size: var(--fs-2xl);
  }
  .hero__lead {
    font-size: var(--fs-base);
  }
}
</style>
