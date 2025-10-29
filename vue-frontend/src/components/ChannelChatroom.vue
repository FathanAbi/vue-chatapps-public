<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'

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

const router = useRouter()
const channels = ref<Channel[]>([])
const currentChannel = ref<Channel | null>(null)
const messages = ref<Message[]>([])
const newMessage = ref('')
const userId = ref<string | null>(null)
const isJoined = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
const sidebarOpen = ref(false)

// ✅ Fetch user info
async function fetchUser() {
  const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/me`, {
    credentials: 'include',
  })
  const data = await resp.json()
  userId.value = data.user.id
}

// ✅ Fetch all channels
async function fetchChannels() {
  const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/channels`, {
    credentials: 'include',
  })
  const data = await resp.json()
  channels.value = data.docs
}

// ✅ Switch channel
async function switchChannel(channel: Channel) {
  currentChannel.value = channel
  sidebarOpen.value = false
  await checkMembership(channel.id)
  await fetchMessages(channel.id)
}

// ✅ Check membership
async function checkMembership(channelId: string) {
  if (!userId.value) return
  const resp = await fetch(
    `${import.meta.env.VITE_API_URL}/api/memberships?where[pengguna_id][equals]=${userId.value}&where[channel_id][equals]=${channelId}`,
    { credentials: 'include' }
  )
  const data = await resp.json()
  isJoined.value = data.docs.length > 0
}

// ✅ Fetch messages
async function fetchMessages(channelId: string) {
  const resp = await fetch(
    `${import.meta.env.VITE_API_URL}/api/messages?where[Channel][equals]=${channelId}&sort=createdAt&depth=1`,
    { credentials: 'include' }
  )
  const data = await resp.json()

  messages.value = data.docs.map((msg: any) => ({
    id: msg.id,
    sender_id: msg.Sender?.id || msg.Sender,
    sender_username: msg.Sender?.username || 'Unknown',
    message: msg.message,
    createdAt: msg.createdAt,
  }))

  await nextTick()
  if (messagesContainer.value) messagesContainer.value.scrollTop = 0
}

// ✅ Send a message
async function sendMessage() {
  if (!newMessage.value.trim() || !currentChannel.value || !userId.value) return

  const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: newMessage.value,
      Sender: userId.value,
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
  const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/memberships`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pengguna_id: userId.value,
      channel_id: currentChannel.value.id,
    }),
  })
  if (resp.ok) isJoined.value = true
}

// ✅ Create new channel
async function createChannel() {
  const name = prompt('Enter new channel name:')
  if (!name || !userId.value) return

  const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/channels`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_name: name,
      owner: userId.value,
    }),
  })

  if (!resp.ok) return console.error('Failed to create channel:', await resp.text())

  const channelData = await resp.json()
  const newChannel = channelData.doc

  await fetch(`${import.meta.env.VITE_API_URL}/api/memberships`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pengguna_id: userId.value,
      channel_id: newChannel.id,
    }),
  })

  await fetchChannels()
  currentChannel.value = newChannel
  isJoined.value = true
  await fetchMessages(newChannel.id)
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

let refreshInterval: number | null = null // store interval ID

onMounted(async () => {
  await fetchUser()
  await fetchChannels()

  // Auto-refresh messages every 3 seconds
  refreshInterval = window.setInterval(() => {
    if (currentChannel.value) {
      fetchMessages(currentChannel.value.id)
    }
  }, 3000) // adjust interval as needed
})

onBeforeUnmount(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
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
          :class="{ active: channel.id === currentChannel?.id }"
          @click="switchChannel(channel)"
        >
          # {{ channel.channel_name }}
        </li>
      </ul>
      <button class="create-btn" @click="createChannel">+ New Channel</button>
    </aside>

    <!-- Main -->
    <main class="chat-main">
      <header class="chat-header">
        <div class="header-left">
          <button class="menu-btn" @click="sidebarOpen = !sidebarOpen">☰</button>
          <h2># {{ currentChannel?.channel_name || 'Select a channel' }}</h2>
        </div>
        <div class="header-actions">
          <button class="back-btn" @click="goToDashboard">← Dashboard</button>
          <button class="join-btn" v-if="!isJoined" @click="joinChannel">Join</button>
        </div>
      </header>

      <div class="chat-messages" ref="messagesContainer">
        <div v-if="messages.length === 0" class="empty-chat">
          <p>No messages yet...</p>
        </div>
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="['message', msg.sender_id === userId ? 'own' : 'other']"
        >
          <div class="message-info">
            <span class="sender">{{ msg.sender_username }}</span>
            <span class="time">{{ formatTime(msg.createdAt) }}</span>
          </div>
          <p class="content">{{ msg.message }}</p>
        </div>
      </div>

      <footer v-if="isJoined" class="chat-input">
        <input
          v-model="newMessage"
          placeholder="Type a message..."
          @keyup.enter="sendMessage"
        />
        <button @click="sendMessage">Send</button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
/* ===== Base Layout ===== */
.chatroom-container {
  display: flex;
  height: 100vh;
  background: #f9f9f9; /* light background */
  color: #333; /* dark text */
  overflow: hidden;
}

/* ===== Sidebar ===== */
.sidebar {
  width: 260px;
  background: #ffffff; /* sidebar light */
  padding: 1rem;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
}
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.close-btn {
  display: none;
  background: none;
  border: none;
  color: #333;
  font-size: 1.2rem;
}
.channel-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
  flex: 1;
  overflow-y: auto;
}
.channel-list li {
  padding: 0.6rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.2s;
  color: #333;
}
.channel-list li:hover {
  background: #f0f0f0;
}
.channel-list li.active {
  background: #e0e0e0;
  font-weight: bold;
}
.create-btn {
  background: #4caf50;
  border: none;
  color: white;
  padding: 0.6rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}
.create-btn:hover {
  background: #45a049;
}

/* ===== Main Chat Area ===== */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.chat-header {
  padding: 1rem;
  background: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #ddd;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.menu-btn {
  display: none;
  background: #f0f0f0;
  border: none;
  color: #333;
  padding: 0.5rem;
  border-radius: 6px;
  cursor: pointer;
}
.back-btn,
.join-btn {
  background: #e0e0e0;
  border: none;
  color: #333;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  margin-left: 0.5rem;
}
.back-btn:hover,
.join-btn:hover {
  background: #d0d0d0;
}

/* ===== Messages ===== */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.message {
  max-width: 60%;
  padding: 0.8rem;
  border-radius: 10px;
  background: #f0f0f0;
  color: #333;
}
.message.own {
  align-self: flex-end;
  background: #d0f0d0; /* light green for own messages */
}
.message-info {
  font-size: 0.8rem;
  color: #666;
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.content {
  word-wrap: break-word;
}
.empty-chat {
  color: #999;
  text-align: center;
  margin-top: 2rem;
}

/* ===== Input Area ===== */
.chat-input {
  display: flex;
  padding: 0.8rem;
  background: #ffffff;
  border-top: 1px solid #ddd;
}
.chat-input input {
  flex: 1;
  padding: 0.6rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  margin-right: 0.6rem;
  background: #f9f9f9;
  color: #333;
}
.chat-input button {
  background: #4caf50;
  border: none;
  color: white;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  cursor: pointer;
}
.chat-input button:hover {
  background: #45a049;
}

/* ===== Mobile Responsiveness ===== */
@media (max-width: 768px) {
  .sidebar {
    position: absolute;
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
  .message {
    max-width: 80%;
  }
}
</style>
