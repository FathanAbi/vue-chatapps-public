<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { startPolling } from '../utils/polling.js'
import { useChatStore } from '../stores/chat.js'
import EmptyState from './ui/EmptyState.vue'
import BaseButton from './ui/BaseButton.vue'
import BaseBadge from './ui/BaseBadge.vue'
import AppIcon from './ui/AppIcon.vue'

interface Channel {
  id: string
  channel_name: string
}

interface Message {
  id: string
  sender_id: string
  sender_username: string
  message: string
  createdAt: string
}

const route = useRoute()
const store = useChatStore()

const currentChannel = ref<Channel | null>(null)
const messages = ref<Message[]>([])
const newMessage = ref('')
const isJoined = ref(false)
const membershipChecked = ref(false)
// `true` until the channel named by the route has been resolved, so a cold load
// never flashes "No messages yet" before the fetch lands.
const loadingChannel = ref(true)
const loadingMessages = ref(false)
const notFound = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)

// B7: pagination state for channel messages.
const PAGE_SIZE = 50
const page = ref(1)
const hasMore = ref(true)
const loadingMore = ref(false)

/**
 * The route param is the single source of truth for which channel is open.
 * This is what makes a hard refresh on `/channel/:id` work: the component no
 * longer depends on state carried over from the list that navigated here.
 */
const channelId = computed(() => String(route.params.id ?? ''))

const apiBase = import.meta.env.VITE_API_URL
const userId = computed(() => store.userId)

// ✅ Check membership (kept component-local for its loading/refresh semantics)
async function checkMembership(id: string) {
  isJoined.value = false
  membershipChecked.value = false

  if (!userId.value || !id) {
    membershipChecked.value = true
    return
  }

  const resp = await fetch(
    `${apiBase}/api/memberships?where[pengguna_id][equals]=${userId.value}&where[channel_id][equals]=${id}`,
    { credentials: 'include' },
  )

  if (resp.ok) {
    const data = await resp.json()
    isJoined.value = (data.docs ?? []).length > 0
  }

  membershipChecked.value = true
}

const mapMessage = (msg: any): Message => ({
  id: msg.id,
  sender_id: msg.Sender?.id ?? msg.Sender,
  sender_username: msg.Sender?.username || 'Unknown',
  message: msg.message,
  createdAt: msg.createdAt,
})

// ✅ Fetch the latest page of messages (initial load + polling)
async function fetchMessages(id: string) {
  loadingMessages.value = true

  try {
    const resp = await fetch(
      `${apiBase}/api/messages?where[Channel][equals]=${id}&sort=-createdAt&limit=${PAGE_SIZE}&page=1&depth=1`,
      { credentials: 'include' },
    )

    if (!resp.ok) {
      messages.value = []
      hasMore.value = false
      return
    }

    const data = await resp.json()

    // A response that arrives after the route moved on belongs to the previous
    // channel and must not overwrite the newly loaded one.
    if (String(currentChannel.value?.id) !== String(id)) return

    // API returns newest-first; the view renders oldest-first.
    messages.value = (data.docs ?? []).map(mapMessage).reverse()
    page.value = 1
    hasMore.value = Boolean(data.hasNextPage)

    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  } finally {
    loadingMessages.value = false
  }
}

/**
 * Load the channel named by the current route param.
 */
async function loadChannel(id: string) {
  loadingChannel.value = true
  // Clear the previous channel's content immediately so switching never shows
  // stale messages under the new channel's name.
  currentChannel.value = null
  messages.value = []
  hasMore.value = false
  notFound.value = false

  if (!id || id === 'undefined' || id === 'null' || id.includes('object')) {
    notFound.value = true
    membershipChecked.value = true
    loadingChannel.value = false
    return
  }

  try {
    const resp = await fetch(`${apiBase}/api/channels/${id}`, {
      credentials: 'include',
    })

    if (!resp.ok) {
      notFound.value = true
      membershipChecked.value = true
      return
    }

    currentChannel.value = await resp.json()

    await checkMembership(id)
    await fetchMessages(id)
  } finally {
    loadingChannel.value = false
  }
}

// B7: load the next older page and prepend it.
async function loadOlder() {
  if (!currentChannel.value || !hasMore.value || loadingMore.value) return

  loadingMore.value = true
  const nextPage = page.value + 1

  try {
    const resp = await fetch(
      `${apiBase}/api/messages?where[Channel][equals]=${currentChannel.value.id}&sort=-createdAt&limit=${PAGE_SIZE}&page=${nextPage}&depth=1`,
      { credentials: 'include' },
    )
    const data = await resp.json()

    const older = (data.docs ?? []).map(mapMessage).reverse()
    messages.value = [...older, ...messages.value]
    page.value = nextPage
    hasMore.value = Boolean(data.hasNextPage)
  } finally {
    loadingMore.value = false
  }
}

// ✅ Send a message
async function sendMessage() {
  if (!newMessage.value.trim() || !currentChannel.value || !userId.value) return

  const resp = await fetch(`${apiBase}/api/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: newMessage.value,
      Channel: currentChannel.value.id,
    }),
  })

  if (resp.ok) {
    newMessage.value = ''
    await fetchMessages(currentChannel.value.id)
  } else {
    console.error('Failed to send message:', await resp.text())
  }
}

// ✅ Join channel — delegates to the shared store so the sidebar stays in sync.
async function joinChannel() {
  if (!currentChannel.value || !userId.value) return

  const resp = await fetch(`${apiBase}/api/memberships`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: currentChannel.value.id,
    }),
  })

  if (resp.ok) {
    isJoined.value = true
    await store.loadChannels()
    await fetchMessages(currentChannel.value.id)
  } else {
    console.error('Failed to join channel:', await resp.text())
  }
}

function isOwn(msg: Message) {
  return String(msg.sender_id) === String(userId.value)
}

// Only the first message of a run from the same sender carries the meta row.
function isFirstInGroup(index: number) {
  if (index === 0) return true

  return String(messages.value[index - 1].sender_id) !== String(messages.value[index].sender_id)
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

let stopPolling: (() => void) | null = null

// Switching channels via the sidebar (or browser back/forward) only changes the
// param, so the reload is driven by the route rather than by the click handler.
watch(channelId, (id, previous) => {
  if (id && id !== previous) loadChannel(id)
})

onMounted(async () => {
  if (!store.me) await store.fetchMe()
  await loadChannel(channelId.value)

  // B7: auto-refresh with exponential backoff, paused while the tab is hidden.
  stopPolling = startPolling(
    () => {
      if (currentChannel.value) {
        return fetchMessages(currentChannel.value.id)
      }
    },
    { baseDelay: 3000, maxDelay: 30000 },
  )
})

onBeforeUnmount(() => {
  if (stopPolling) {
    stopPolling()
  }
})
</script>

<template>
  <div class="thread">
    <header class="thread__header">
      <BaseButton
        to="/dashboard"
        variant="ghost"
        icon="arrow-left"
        icon-only
        label="Back to dashboard"
        class="thread__back"
      />
      <div class="thread__title-wrap">
        <h1 class="thread__title">
          <template v-if="notFound">Channel not found</template>
          <template v-else-if="loadingChannel">Loading…</template>
          <template v-else>
            <AppIcon name="hash" :size="18" class="thread__hash" />{{
              currentChannel?.channel_name || 'Channel'
            }}
          </template>
        </h1>
        <p v-if="!notFound && !loadingChannel && membershipChecked" class="thread__subtitle">
          <BaseBadge :variant="isJoined ? 'success' : 'neutral'">
            {{ isJoined ? 'Member' : 'Not a member' }}
          </BaseBadge>
        </p>
      </div>
      <BaseButton v-if="membershipChecked && !isJoined && !notFound" size="sm" @click="joinChannel">
        Join channel
      </BaseButton>
    </header>

    <div ref="messagesContainer" class="thread__body">
      <EmptyState
        v-if="notFound"
        icon="alert"
        title="Channel not found"
        text="This channel does not exist, or you no longer have access to it."
      />

      <template v-else>
        <div v-if="hasMore && !loadingChannel" class="load-older-row">
          <button class="load-older-btn" :disabled="loadingMore" @click="loadOlder">
            {{ loadingMore ? 'Loading…' : 'Load older messages' }}
          </button>
        </div>

        <EmptyState
          v-if="!messages.length && !loadingMessages && !loadingChannel"
          icon="message"
          text="No messages yet. Say hi!"
        />

        <div
          v-for="(msg, index) in messages"
          :key="msg.id"
          class="message"
          :class="isOwn(msg) ? 'message--own' : 'message--them'"
        >
          <div v-if="isFirstInGroup(index)" class="message__meta">
            <span v-if="!isOwn(msg)" class="message__sender">{{ msg.sender_username }}</span>
            <span class="message__time">{{ formatTime(msg.createdAt) }}</span>
          </div>
          <p class="bubble">{{ msg.message }}</p>
        </div>
      </template>
    </div>

    <form v-if="!loadingChannel && isJoined" class="composer" @submit.prevent="sendMessage">
      <input
        v-model="newMessage"
        class="composer__input"
        type="text"
        placeholder="Type a message…"
        aria-label="Message"
      />
      <button
        type="submit"
        class="composer__send"
        :disabled="!newMessage.trim()"
        aria-label="Send message"
      >
        <AppIcon name="send" :size="18" />
      </button>
    </form>

    <footer
      v-else-if="!loadingChannel && membershipChecked && !notFound"
      class="composer composer--prompt"
    >
      <span class="composer__hint">Join this channel to send messages.</span>
      <BaseButton size="sm" @click="joinChannel">Join</BaseButton>
    </footer>
  </div>
</template>

<style scoped>
.thread {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.thread__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex: 0 0 auto;
}

.thread__back {
  flex: 0 0 auto;
}

.thread__title-wrap {
  min-width: 0;
  flex: 1;
}

.thread__title {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread__hash {
  color: var(--color-text-muted);
}

.thread__subtitle {
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}

.thread__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.load-older-row {
  display: flex;
  justify-content: center;
  padding-bottom: var(--space-2);
}
.load-older-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-4);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.load-older-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.message {
  display: flex;
  flex-direction: column;
  /* Stretch the row so the bubble's max-width resolves against the pane. */
  align-self: stretch;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  align-items: flex-start;
}
.message--own {
  align-items: flex-end;
}

.message__meta {
  display: flex;
  gap: var(--space-2);
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  margin-bottom: 2px;
  padding: 0 var(--space-1);
}
.message__sender {
  font-weight: var(--fw-semibold);
}

.bubble {
  width: max-content;
  max-width: min(65%, 560px);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-lg);
  line-height: var(--lh-normal);
  overflow-wrap: break-word;
}
.message--them .bubble {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.message--own .bubble {
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
  color: var(--color-on-primary);
}

/* Composer */
.composer {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  flex: 0 0 auto;
}

.composer--prompt {
  justify-content: space-between;
  min-height: 68px;
}

.composer__hint {
  color: var(--color-text-muted);
  font-size: var(--fs-sm);
}

.composer__input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  outline: none;
}
.composer__input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}

.composer__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-on-primary);
  cursor: pointer;
  transition: background var(--transition);
}
.composer__send:hover:not(:disabled) {
  background: var(--color-primary-hover);
}
.composer__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .bubble {
    max-width: 85%;
  }
}
</style>
