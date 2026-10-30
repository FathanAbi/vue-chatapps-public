<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../../stores/chat.js'
import AppIcon from '../ui/AppIcon.vue'
import BaseAvatar from '../ui/BaseAvatar.vue'

defineEmits(['toggle-sidebar'])

const router = useRouter()
const store = useChatStore()

const menuOpen = ref(false)
const menuRoot = ref(null)

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function closeMenu() {
  menuOpen.value = false
}

async function handleLogout() {
  closeMenu()
  await store.logout()
  router.push('/login')
}

function onDocumentClick(event) {
  if (menuRoot.value && !menuRoot.value.contains(event.target)) closeMenu()
}

function onKeydown(event) {
  if (event.key === 'Escape') closeMenu()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <button
        type="button"
        class="app-header__toggle"
        aria-label="Toggle navigation"
        @click="$emit('toggle-sidebar')"
      >
        <AppIcon name="menu" :size="20" />
      </button>

      <RouterLink to="/dashboard" class="app-header__brand">
        <span class="app-header__logo" aria-hidden="true">
          <AppIcon name="message" :size="18" />
        </span>
        <span class="app-header__name">VueChat</span>
      </RouterLink>
    </div>

    <div class="app-header__right">
      <div ref="menuRoot" class="user-menu">
        <button
          type="button"
          class="user-menu__trigger"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          @click="toggleMenu"
        >
          <BaseAvatar :name="store.me?.username" size="sm" />
          <span class="user-menu__name">{{ store.me?.username || 'Account' }}</span>
          <AppIcon name="chevron-down" :size="16" class="user-menu__caret" />
        </button>

        <div v-if="menuOpen" class="user-menu__panel" role="menu">
          <div class="user-menu__info">
            <p class="user-menu__username">{{ store.me?.username }}</p>
            <p class="user-menu__email">{{ store.me?.email }}</p>
          </div>
          <button type="button" class="user-menu__item" role="menuitem" @click="handleLogout">
            <AppIcon name="logout" :size="16" />
            Log out
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: var(--header-h);
  flex: 0 0 auto;
  padding: 0 var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: var(--z-header);
}

.app-header__left,
.app-header__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.app-header__toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
}

.app-header__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-weight: var(--fw-bold);
}
.app-header__brand:hover {
  text-decoration: none;
}

.app-header__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.app-header__name {
  font-size: var(--fs-lg);
}

.user-menu {
  position: relative;
}

.user-menu__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-2) 0 var(--space-1);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  cursor: pointer;
  color: var(--color-text);
}
.user-menu__trigger:hover {
  background: var(--color-surface-2);
}

.user-menu__name {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__caret {
  color: var(--color-text-subtle);
}

.user-menu__panel {
  position: absolute;
  right: 0;
  top: calc(100% + var(--space-2));
  min-width: 220px;
  padding: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-modal);
}

.user-menu__info {
  padding: var(--space-2) var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-2);
}

.user-menu__username {
  font-weight: var(--fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__email {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font-size: var(--fs-base);
  cursor: pointer;
  text-align: left;
}
.user-menu__item:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

@media (max-width: 1023px) {
  .app-header__toggle {
    display: inline-flex;
  }
  .user-menu__name {
    display: none;
  }
}
</style>
