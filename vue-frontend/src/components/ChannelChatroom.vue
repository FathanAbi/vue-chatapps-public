<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { startPolling } from '../utils/polling.js'

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
const router = useRouter()

const channels = ref<Channel[]>([])
const currentChannel = ref<Channel | null>(null)
const messages = ref<Message[]>([])
const newMessage = ref('')
const userId = ref<string | null>(null)
const isJoined = ref(false)
const membershipChecked = ref(false)
// `true` until the channel named by the route has been resolved, so a cold load
// never flashes "Select a channel" / "No messages yet" before the fetch lands.
const loadingChannel = ref(true)
const loadingMessages = ref(false)
const notFound = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const sidebarOpen = ref(false)

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

// ✅ Fetch user info
async function fetchUser() {
  const resp = await fetch(`${apiBase}/api/penggunas/me`, {
    credentials: 'include',
  })

  if (!resp.ok) {
    await router.push('/login')
    return
  }

  const data = await resp.json()

  if (!data?.user) {
    await router.push('/login')
    return
  }

  userId.value = data.user.id
}

// ✅ Fetch all channels (sidebar)
async function fetchChannels() {
  const resp = await fetch(`${apiBase}/api/channels`, {
    credentials: 'include',
  })

  if (!resp.ok) return

  const data = await resp.json()
  channels.value = data.docs ?? []
}

// ✅ Check membership
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
 *
 * Everything is fetched from the id alone, so a cold load (direct URL, refresh,
 * shared link) behaves exactly like an in-app navigation.
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
    sidebarOpen.value = false

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

// ✅ Join channel
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
    await fetchMessages(currentChannel.value.id)
  } else {
    console.error('Failed to join channel:', await resp.text())
  }
}

// ✅ Create new channel
async function createChannel() {
  const name = prompt('Enter new channel name:')
  if (!name || !userId.value) return

  const resp = await fetch(`${apiBase}/api/channels`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_name: name,
    }),
  })

  if (!resp.ok) return console.error('Failed to create channel:', await resp.text())

  const channelData = await resp.json()
  const newChannel = channelData.doc

  await fetch(`${apiBase}/api/memberships`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: newChannel.id,
    }),
  })

  await fetchChannels()
  await goToChannel(newChannel)
}

/** Navigate by id only — never by channel object. */
function goToChannel(channel: Pick<Channel, 'id'> | string | number) {
  const id = channel && typeof channel === 'object' ? channel.id : channel

  if (id === null || id === undefined || id === '') return

  if (String(id) === channelId.value) {
    sidebarOpen.value = false
    return
  }

  router.push({ name: 'ChannelChatroom', params: { id: String(id) } })
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
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

function goToDashboard() {
  router.push('/dashboard')
}

let stopPolling: (() => void) | null = null

// Switching channels via the sidebar (or browser back/forward) only changes the
// param, so the reload is driven by the route rather than by the click handler.
watch(channelId, (id, previous) => {
  if (id && id !== previous) loadChannel(id)
})

onMounted(async () => {
  await fetchUser()
  await fetchChannels()
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
  <div class="chatroom-container">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <h2>Channels</h2>
        <button class="close-btn" @click="sidebarOpen = false">✕</button>
      </div>
      <ul class="channel-list">
        <li
          v-for="channel in channels"
          :key="channel.id"
          class="channel-row"
          :class="{ active: String(channel.id) === channelId }"
          @click="goToChannel(channel)"
        >
          <span class="channel-name"># {{ channel.channel_name }}</span>
        </li>
      </ul>
      <button class="create-btn" @click="createChannel">+ New Channel</button>
    </aside>

    <!-- Main -->
    <main class="chat-main">
      <header class="chat-header">
        <div class="header-left">
          <button class="menu-btn" @click="sidebarOpen = !sidebarOpen">☰</button>
          <h2 class="chat-title">
            <template v-if="notFound">Channel not found</template>
            <template v-else-if="loadingChannel">Loading…</template>
            <template v-else># {{ currentChannel?.channel_name || 'Select a channel' }}</template>
          </h2>
        </div>
        <div class="header-actions">
          <button class="back-btn" @click="goToDashboard">← Dashboard</button>
          <button class="join-btn" v-if="membershipChecked && !isJoined && !notFound" @click="joinChannel">
            Join
          </button>
        </div>
      </header>

      <div class="chat-messages" ref="messagesContainer">
        <div v-if="notFound" class="empty-chat">
          <p>This channel does not exist, or you no longer have access to it.</p>
        </div>

        <template v-else>
          <div v-if="hasMore && !loadingChannel" class="load-older-row">
            <button class="load-older-btn" @click="loadOlder" :disabled="loadingMore">
              {{ loadingMore ? 'Loading…' : 'Load older messages' }}
            </button>
          </div>

          <div v-if="!messages.length && !loadingMessages && !loadingChannel" class="empty-chat">
            <p>No messages yet. Say hi!</p>
          </div>

          <div
            v-for="(msg, index) in messages"
            :key="msg.id"
            :class="['message', isOwn(msg) ? 'own' : 'received']"
          >
            <div v-if="isFirstInGroup(index)" class="meta">
              <span v-if="!isOwn(msg)" class="sender">{{ msg.sender_username }}</span>
              <span class="time">{{ formatTime(msg.createdAt) }}</span>
            </div>
            <p class="bubble">{{ msg.message }}</p>
          </div>
        </template>
      </div>

      <footer v-if="!loadingChannel && isJoined" class="composer">
        <input
          v-model="newMessage"
          class="composer-input"
          placeholder="Type a message..."
          @keyup.enter="sendMessage"
        />
        <button class="composer-send" @click="sendMessage" :disabled="!newMessage.trim()">
          Send
        </button>
      </footer>

      <!-- Not a member yet: keep the pane height stable and offer to join. -->
      <footer v-else-if="!loadingChannel && membershipChecked && !notFound" class="composer join-prompt">
        <span class="hint">Join this channel to send messages.</span>
        <button class="join-btn" @click="joinChannel">Join</button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
/* ===== Base Layout ===== */
.chatroom-container {
  display: flex;
  height: 100vh;
  height: 100dvh;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

/* ===== Sidebar ===== */
.sidebar {
  width: 260px;
  flex: 0 0 260px;
  background: var(--bg);
  border-right: 1px solid var(--border);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition: transform 0.3s ease;
}
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sidebar-header h2 {
  font-size: 1rem;
  margin: 0;
}
.close-btn {
  display: none;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 1.2rem;
  cursor: pointer;
}
.channel-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.channel-list li.channel-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0.5rem 0.8rem;
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.2s;
}
.channel-list li.channel-row:hover {
  background: var(--surface);
}
.channel-list li.channel-row.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.channel-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.create-btn {
  flex: 0 0 auto;
  background: var(--accent);
  border: none;
  color: #fff;
  padding: 0.6rem;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.2s;
}
.create-btn:hover {
  background: var(--accent-hover);
}

/* ===== Main Chat Area ===== */
.chat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg);
}
.chat-header {
  padding: 0.9rem 1rem;
  background: var(--surface);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
}
.chat-title {
  margin: 0;
  font-size: 1.05rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
}
.menu-btn {
  display: none;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.35rem 0.55rem;
  border-radius: 8px;
  cursor: pointer;
}
.back-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-size: 0.85rem;
}
.back-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.join-btn {
  background: var(--accent);
  border: none;
  color: #fff;
  padding: 0.4rem 1rem;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-size: 0.85rem;
}
.join-btn:hover {
  background: var(--accent-hover);
}

/* ===== Messages ===== */
.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.load-older-row {
  display: flex;
  justify-content: center;
  padding-bottom: 0.5rem;
}
.load-older-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: var(--radius-pill);
  padding: 0.35rem 0.9rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.load-older-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  /*
   * The messages container is a column flex box, so a `.message` flex item
   * defaults to shrink-to-fit on the cross axis. That narrow box then becomes
   * the reference for the bubble's own `fit-content`/`max-width`, collapsing
   * short messages into a per-character vertical pill. Stretching the row to
   * the full width makes `max-width: 65%` (on `.bubble`) resolve against the
   * pane instead of against the message's own content.
   */
  align-self: stretch;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.message.own {
  align-items: flex-end;
}

.bubble {
  /*
   * `fit-content` is deliberately avoided: combined with the parent row it
   * produced a min-content-width bubble. `max-content` sizes the bubble to the
   * text and `max-width` caps long lines, which is the intended behaviour.
   */
  width: max-content;
  max-width: 65%;
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  line-height: 1.45;
  /*
   * `anywhere` shrinks min-content to a single character, so a constrained
   * bubble wraps one letter per line. `break-word` only breaks a word that
   * cannot fit on a line of its own.
   */
  overflow-wrap: break-word;
}
.received .bubble {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}
.own .bubble {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: #fff;
}

.meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}
.meta .sender {
  font-weight: 600;
}

.empty-chat {
  margin: auto;
  color: var(--muted);
  text-align: center;
  padding: 32px 16px;
  font-size: 14px;
}
.empty-chat p {
  margin: 0;
}

/* ===== Composer ===== */
.composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex: 0 0 auto;
}
.composer-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text);
}
.composer-input::placeholder {
  color: var(--muted);
}
.composer-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.composer-send {
  flex: 0 0 auto;
  height: 44px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}
.composer-send:hover:not(:disabled) {
  background: var(--accent-hover);
}
.composer-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.composer.join-prompt {
  justify-content: space-between;
  min-height: 68px;
}
.composer .hint {
  color: var(--muted);
  font-size: 13px;
}

/* ===== Mobile Responsiveness ===== */
@media (max-width: 768px) {
  .sidebar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    transform: translateX(-100%);
    z-index: 10;
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .close-btn {
    display: block;
  }
  .menu-btn {
    display: block;
  }
  .chat-main {
    flex: 1;
    position: relative;
  }
  .bubble {
    max-width: 85%;
  }
}
</style>
