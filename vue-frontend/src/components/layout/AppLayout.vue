<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '../../stores/chat.js'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'

const route = useRoute()
const router = useRouter()
const store = useChatStore()

// Public screens (auth + landing) render their own layouts.
const isBare = computed(() => route.meta.bare === true)

const sidebarOpen = ref(false)

function openSidebar() {
  sidebarOpen.value = true
}
function closeSidebar() {
  sidebarOpen.value = false
}

// Close the mobile drawer whenever navigation happens.
watch(() => route.fullPath, closeSidebar)

function onKeydown(event) {
  if (event.key === 'Escape') closeSidebar()
}

async function bootstrap() {
  if (isBare.value) return

  // The route guard already verified the session, but a direct page load lands
  // here without `me` in the store.
  if (!store.me) {
    const user = await store.fetchMe()
    if (!user) {
      router.push('/login')
      return
    }
  }

  if (!store.loaded) {
    await store.loadChannels()
    store.loaded = true
  }

  await store.loadConversations()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  bootstrap()
})

// Entering a protected route from a public one must bootstrap the shell.
watch(isBare, (bare) => {
  if (!bare) bootstrap()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- Bare routes (auth + public) render without the app chrome. -->
  <RouterView v-if="isBare" />

  <div v-else class="app-shell">
    <AppHeader @toggle-sidebar="sidebarOpen ? closeSidebar() : openSidebar()" />

    <div class="app-shell__body">
      <AppSidebar :open="sidebarOpen" @close="closeSidebar" />

      <div v-if="sidebarOpen" class="app-shell__overlay" aria-hidden="true" @click="closeSidebar" />

      <main class="app-shell__content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--color-bg);
  overflow: hidden;
}

.app-shell__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.app-shell__content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-shell__overlay {
  display: none;
}

@media (max-width: 1023px) {
  .app-shell__overlay {
    display: block;
    position: fixed;
    inset: var(--header-h) 0 0 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: var(--z-overlay);
  }
}
</style>
