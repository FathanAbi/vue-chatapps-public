<script setup>
import PublicLayout from '../components/layout/PublicLayout.vue'
</script>

<template>
  <PublicLayout>
    <article class="about">
      <h1 class="about__title">About</h1>
      <p class="about__text">
        VueChat is a simple chat application: register an account, create or join channels, and
        exchange direct messages with other users.
      </p>
    </article>
  </PublicLayout>
</template>

<style scoped>
.about {
  max-width: 640px;
  margin: 0 auto;
}

.about__title {
  font-size: var(--fs-2xl);
  font-weight: var(--fw-bold);
  margin-bottom: var(--space-4);
}

.about__text {
  color: var(--color-text-muted);
  font-size: var(--fs-lg);
  line-height: var(--lh-relaxed);
}
</style>
