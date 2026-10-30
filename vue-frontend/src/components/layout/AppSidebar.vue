<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import qs from 'qs'
import { useChatStore } from '../../stores/chat.js'
import AppIcon from '../ui/AppIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseAvatar from '../ui/BaseAvatar.vue'

defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const route = useRoute()
const router = useRouter()
const store = useChatStore()

const activeChannelId = computed(() => String(route.params.id ?? ''))

// The DM route is named `channel` and carries the partner in `user_id`.
const activeChatUserId = computed(() =>
  route.name === 'channel' ? String(route.params.user_id ?? '') : '',
)

function isActiveConversation(conv) {
  return activeChatUserId.value !== '' && String(conv.userId) === activeChatUserId.value
}

// Channel creation (replaces the old `prompt()` in the channel room).
const newChannelName = ref('')
const creating = ref(false)

async function submitCreate() {
  const name = newChannelName.value.trim()
  if (!name || creating.value) return

  creating.value = true
  try {
    const channel = await store.createChannel(name)
    newChannelName.value = ''
    if (channel) goToChannel(channel.id)
  } finally {
    creating.value = false
  }
}

// People directory search (search-based, email-free).
const userSearch = ref('')
const results = ref([])
const searching = ref(false)
let searchTimer = null

watch(userSearch, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 300)
})

async function runSearch() {
  const term = userSearch.value.trim()
  if (term.length < 2) {
    results.value = []
    searching.value = false
    return
  }

  searching.value = true
  const query = qs.stringify({ q: term, limit: 25 })
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/directory?${query}`, {
      credentials: 'include',
    })
    const data = res.ok ? await res.json() : { docs: [] }
    results.value = (data.docs ?? []).filter((u) => u.id !== store.userId)
  } finally {
    searching.value = false
  }
}

function goToChannel(id) {
  if (id === null || id === undefined || id === '') return
  emit('close')
  router.push({ name: 'ChannelChatroom', params: { id: String(id) } })
}

function goToChat(id) {
  emit('close')
  router.push(`/chat/${id}`)
}

const hasSearchResults = computed(() => userSearch.value.trim().length >= 2)
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--open': open }">
    <div class="sidebar__scroll">
      <!-- Channels -->
      <section class="sidebar__section">
        <h2 class="sidebar__heading">
          <AppIcon name="hash" :size="14" />
          Channels
        </h2>

        <form class="sidebar__create" @submit.prevent="submitCreate">
          <input
            v-model="newChannelName"
            class="sidebar__create-input"
            type="text"
            placeholder="New channel name"
            aria-label="New channel name"
          />
          <BaseButton
            type="submit"
            size="sm"
            icon="plus"
            icon-only
            label="Create channel"
            :loading="creating"
            :disabled="!newChannelName.trim()"
          />
        </form>

        <p v-if="store.loadingChannels" class="sidebar__muted">Loading…</p>
        <p v-else-if="!store.channels.length" class="sidebar__muted">No channels yet.</p>
        <ul v-else class="sidebar__list">
          <li v-for="ch in store.channels" :key="ch.id">
            <button
              type="button"
              class="channel-row"
              :class="{ 'channel-row--active': String(ch.id) === activeChannelId }"
              @click="goToChannel(ch.id)"
            >
              <AppIcon name="hash" :size="15" class="channel-row__icon" />
              <span class="channel-row__name">{{ ch.channel_name }}</span>
            </button>
          </li>
        </ul>
      </section>

      <!-- Direct messages -->
      <section class="sidebar__section">
        <h2 class="sidebar__heading">
          <AppIcon name="message" :size="14" />
          Direct messages
        </h2>

        <p v-if="store.loadingConversations" class="sidebar__muted">Loading…</p>
        <p v-else-if="!store.conversations.length" class="sidebar__muted">
          No conversations yet. Search for someone below.
        </p>
        <ul v-else class="sidebar__list">
          <li v-for="conv in store.conversations" :key="conv.userId">
            <button
              type="button"
              class="user-row"
              :class="{ 'user-row--active': isActiveConversation(conv) }"
              @click="goToChat(conv.userId)"
            >
              <BaseAvatar :name="conv.username" size="sm" />
              <span class="user-row__body">
                <span class="user-row__name">{{ conv.username }}</span>
                <span class="user-row__preview">{{ conv.lastMessage }}</span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <!-- People -->
      <section class="sidebar__section">
        <h2 class="sidebar__heading">
          <AppIcon name="users" :size="14" />
          People
        </h2>

        <div class="sidebar__search">
          <AppIcon name="search" :size="16" class="sidebar__search-icon" />
          <input
            v-model="userSearch"
            class="sidebar__search-input"
            type="search"
            placeholder="Search users…"
            aria-label="Search users"
          />
        </div>

        <p v-if="!hasSearchResults" class="sidebar__muted">
          Type at least 2 characters to find a user.
        </p>
        <p v-else-if="searching" class="sidebar__muted">Searching…</p>
        <p v-else-if="!results.length" class="sidebar__muted">No matching users.</p>
        <ul v-else class="sidebar__list">
          <li v-for="u in results" :key="u.id">
            <button type="button" class="user-row" @click="goToChat(u.id)">
              <BaseAvatar :name="u.username" size="sm" />
              <span class="user-row__name">{{ u.username }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <button
      type="button"
      class="sidebar__close"
      aria-label="Close navigation"
      @click="emit('close')"
    >
      <AppIcon name="close" :size="18" />
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-w);
  flex: 0 0 var(--sidebar-w);
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.sidebar__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4);
}

.sidebar__section + .sidebar__section {
  margin-top: var(--space-6);
}

.sidebar__heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-3);
}

.sidebar__create {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.sidebar__create-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  outline: none;
}
.sidebar__create-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}

.sidebar__search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}
.sidebar__search:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}

.sidebar__search-icon {
  color: var(--color-text-subtle);
  flex: 0 0 auto;
}

.sidebar__search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
}

.sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.channel-row,
.user-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition);
}
.channel-row:hover,
.user-row:hover {
  background: var(--color-surface-2);
}

.channel-row--active {
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: var(--fw-medium);
}
.channel-row--active:hover {
  background: var(--color-primary-hover);
}

.user-row--active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: var(--fw-medium);
}
.user-row--active:hover {
  background: var(--color-primary-soft);
}

.user-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.user-row__preview {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-row--active .user-row__preview {
  color: inherit;
  opacity: 0.85;
}

.channel-row__icon {
  flex: 0 0 auto;
  opacity: 0.7;
}

.channel-row__name,
.user-row__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__muted {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.sidebar__close {
  display: none;
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
}

@media (max-width: 1023px) {
  .sidebar {
    position: fixed;
    top: var(--header-h);
    left: 0;
    bottom: 0;
    z-index: var(--z-sidebar);
    transform: translateX(-100%);
    transition: transform var(--transition);
    box-shadow: var(--shadow-lg);
    border-right: 1px solid var(--color-border);
  }
  .sidebar--open {
    transform: translateX(0);
  }
  .sidebar__close {
    display: inline-flex;
  }
}
</style>
