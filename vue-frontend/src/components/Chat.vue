<script setup>
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import qs from 'qs'
import { startPolling } from '../utils/polling.js'
import { useChatStore } from '../stores/chat.js'
import AppIcon from './ui/AppIcon.vue'
import BaseAvatar from './ui/BaseAvatar.vue'
import BaseButton from './ui/BaseButton.vue'
import EmptyState from './ui/EmptyState.vue'

const route = useRoute()
const store = useChatStore()

const user_id = ref(null)
const me_id = ref(null)
const user_username = ref(null)
const messages = ref([])
const messageInput = ref('')
const chatBox = ref(null)
const loadingMessages = ref(true)

// B7: message pagination. The initial load fetches the latest page; older
// messages are appended on demand.
const PAGE_SIZE = 50
const page = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)

// Scroll helper
const scrollToBottom = () => {
  if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight
}

// Format message timestamp
const formatDate = (date) =>
  new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Fetch the latest page of messages (used for the initial load and polling)
const getMessages = async () => {
  if (!me_id.value || !user_id.value) return

  const query = {
    or: [
      { and: [{ sender_id: { equals: me_id.value } }, { receiver_id: { equals: user_id.value } }] },
      { and: [{ sender_id: { equals: user_id.value } }, { receiver_id: { equals: me_id.value } }] },
    ],
  }

  const stringifiedQuery = qs.stringify(
    { where: query, limit: PAGE_SIZE, page: 1, sort: '-createdAt' },
    { addQueryPrefix: true },
  )

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/chats${stringifiedQuery}`, {
      credentials: 'include',
    })
    const data = await resp.json()
    messages.value = data.docs
      .map((msg) => ({
        ...msg,
        sender_id: typeof msg.sender_id === 'object' ? msg.sender_id.id : msg.sender_id,
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    page.value = 1
    hasMore.value = Boolean(data.hasNextPage)
    await nextTick()
    scrollToBottom()
  } catch (err) {
    console.error('Failed to fetch messages:', err)
  }
}

// B7: load the next older page and prepend it.
const loadOlder = async () => {
  if (!me_id.value || !user_id.value || !hasMore.value || loadingMore.value) return

  loadingMore.value = true

  const nextPage = page.value + 1
  const query = {
    or: [
      { and: [{ sender_id: { equals: me_id.value } }, { receiver_id: { equals: user_id.value } }] },
      { and: [{ sender_id: { equals: user_id.value } }, { receiver_id: { equals: me_id.value } }] },
    ],
  }

  const stringifiedQuery = qs.stringify(
    { where: query, limit: PAGE_SIZE, page: nextPage, sort: '-createdAt' },
    { addQueryPrefix: true },
  )

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/chats${stringifiedQuery}`, {
      credentials: 'include',
    })
    const data = await resp.json()

    const older = data.docs
      .map((msg) => ({
        ...msg,
        sender_id: typeof msg.sender_id === 'object' ? msg.sender_id.id : msg.sender_id,
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    messages.value = [...older, ...messages.value]
    page.value = nextPage
    hasMore.value = Boolean(data.hasNextPage)
  } catch (err) {
    console.error('Failed to fetch older messages:', err)
  } finally {
    loadingMore.value = false
  }
}

// Fetch user info
const getUserInfo = async () => {
  user_id.value = route.params.user_id

  // Other users' email addresses are not readable by application users, so the
  // chat partner is identified by their username only.
  const partnerRes = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/${user_id.value}`, {
    credentials: 'include',
  })
  const partnerData = await partnerRes.json()
  user_username.value = partnerData.username

  const user = store.me ?? (await store.fetchMe())
  if (!user) return
  me_id.value = user.id

  await getMessages()
  loadingMessages.value = false
}

// Send message
const sendMessage = async () => {
  if (!messageInput.value.trim()) return

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/chats`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiver_id: user_id.value,
        message: messageInput.value,
      }),
    })
    const data = await resp.json()
    messages.value.push({
      ...data.doc,
      sender_id:
        typeof data.doc.sender_id === 'object' ? data.doc.sender_id.id : data.doc.sender_id,
    })
    messageInput.value = ''
    await nextTick()
    scrollToBottom()
    // A new conversation should appear in the sidebar list.
    store.loadConversations()
  } catch (err) {
    console.error('Failed to send message:', err)
  }
}

// Auto-refresh messages. B7: exponential backoff + pause while the tab is hidden.
let stopPolling = null
onMounted(async () => {
  await getUserInfo()
  stopPolling = startPolling(getMessages, { baseDelay: 4000, maxDelay: 30000 })
})

onBeforeUnmount(() => {
  if (stopPolling) stopPolling()
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
      <BaseAvatar :name="user_username" size="md" />
      <div class="thread__title-wrap">
        <h1 class="thread__title">{{ user_username || 'Direct message' }}</h1>
        <p class="thread__subtitle">Direct message</p>
      </div>
    </header>

    <div ref="chatBox" class="thread__body">
      <div v-if="hasMore" class="load-older-row">
        <button class="load-older-btn" :disabled="loadingMore" @click="loadOlder">
          {{ loadingMore ? 'Loading…' : 'Load older messages' }}
        </button>
      </div>

      <EmptyState
        v-if="!loadingMessages && !messages.length"
        icon="message"
        text="No messages yet. Say hi!"
      />

      <div
        v-for="(message, index) in messages"
        :key="message.id || index"
        class="bubble-row"
        :class="
          String(message.sender_id) === String(me_id) ? 'bubble-row--own' : 'bubble-row--them'
        "
      >
        <p class="bubble">{{ message.message }}</p>
        <span class="bubble__time">{{ formatDate(message.createdAt) }}</span>
      </div>
    </div>

    <form class="composer" @submit.prevent="sendMessage">
      <input
        v-model="messageInput"
        class="composer__input"
        type="text"
        placeholder="Type a message…"
        aria-label="Message"
        required
      />
      <button
        type="submit"
        class="composer__send"
        :disabled="!messageInput.trim()"
        aria-label="Send message"
      >
        <AppIcon name="send" :size="18" />
      </button>
    </form>
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
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  gap: var(--space-3);
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

.bubble-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  max-width: 100%;
}
.bubble-row--own {
  align-items: flex-end;
}

.bubble {
  max-width: min(70%, 560px);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-lg);
  line-height: var(--lh-normal);
  overflow-wrap: break-word;
}
.bubble-row--them .bubble {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}
.bubble-row--own .bubble {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.bubble__time {
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
  padding: 0 var(--space-1);
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
