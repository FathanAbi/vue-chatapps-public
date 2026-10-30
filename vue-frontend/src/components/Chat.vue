<template>
  <div class="chatroom">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <!-- Back button -->
      <button class="back-btn" @click="$router.push('/dashboard')">← Back to Dashboard</button>


      <div class="user-info">
        <h2 class="me-name">{{ me_username }}</h2>
        <p class="me-email">{{ me_email }}</p>
      </div>

      <div class="chat-partner">
        <h3>Chatting with:</h3>
        <div class="partner-name">{{ user_username }}</div>
      </div>

      <!-- Close sidebar button (mobile) -->
      <button class="sidebar-close" @click="toggleSidebar">✕</button>
    </aside>

    <!-- Chat main area -->
    <section class="chat-main">
      <header class="chat-header">
        <!-- Menu toggle for mobile -->
        <button class="menu-toggle" @click="toggleSidebar">☰</button>
        {{ user_username }}
      </header>

      <div class="chat-body" ref="chatBox">
        <div v-if="hasMore" class="load-older-row">
          <button class="load-older-btn" @click="loadOlder" :disabled="loadingMore">
            {{ loadingMore ? 'Loading…' : 'Load older messages' }}
          </button>
        </div>
        <div
          v-for="(message, index) in messages"
          :key="index"
          :class="[
            'chat-message',
            message.sender_id === me_id ? 'from-me' : 'from-them'
          ]"
        >
          <p class="chat-text">{{ message.message }}</p>
          <span class="chat-time">{{ formatDate(message.createdAt) }}</span>
        </div>
      </div>

      <form @submit.prevent="sendMessage" class="chat-footer">
        <input
          v-model="messageInput"
          type="text"
          placeholder="Type a message..."
          class="chat-input"
          required
        />
        <button type="submit" class="send-btn">Send</button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import qs from 'qs';
import { startPolling } from '../utils/polling.js';

const route = useRoute();
const router = useRouter();

const user_id = ref(null);
const me_id = ref(null);
const user_username = ref(null);
const me_username = ref(null);
const me_email = ref(null);
const messages = ref([]);
const messageInput = ref('');
const chatBox = ref(null);

// B7: message pagination. The initial load fetches the latest page; older
// messages are appended on demand.
const PAGE_SIZE = 50;
const page = ref(1);
const hasMore = ref(true);
const loadingMore = ref(false);

// Sidebar state
const sidebarOpen = ref(false);
const toggleSidebar = () => sidebarOpen.value = !sidebarOpen.value;

// Scroll helper
const scrollToBottom = () => {
  if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
};

// Format message timestamp
const formatDate = (date) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// Fetch the latest page of messages (used for the initial load and polling)
const getMessages = async () => {
  if (!me_id.value || !user_id.value) return;

  const query = {
    or: [
      { and: [{ sender_id: { equals: me_id.value } }, { receiver_id: { equals: user_id.value } }] },
      { and: [{ sender_id: { equals: user_id.value } }, { receiver_id: { equals: me_id.value } }] }
    ]
  };

  const stringifiedQuery = qs.stringify(
    { where: query, limit: PAGE_SIZE, page: 1, sort: '-createdAt' },
    { addQueryPrefix: true }
  );

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/chats${stringifiedQuery}`, { credentials: 'include' });
    const data = await resp.json();
    messages.value = data.docs
      .map(msg => ({
        ...msg,
        sender_id: typeof msg.sender_id === 'object' ? msg.sender_id.id : msg.sender_id
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    page.value = 1;
    hasMore.value = Boolean(data.hasNextPage);
    await nextTick();
    scrollToBottom();
  } catch (err) {
    console.error("Failed to fetch messages:", err);
  }
};

// B7: load the next older page and prepend it.
const loadOlder = async () => {
  if (!me_id.value || !user_id.value || !hasMore.value || loadingMore.value) return;

  loadingMore.value = true;

  const nextPage = page.value + 1;
  const query = {
    or: [
      { and: [{ sender_id: { equals: me_id.value } }, { receiver_id: { equals: user_id.value } }] },
      { and: [{ sender_id: { equals: user_id.value } }, { receiver_id: { equals: me_id.value } }] }
    ]
  };

  const stringifiedQuery = qs.stringify(
    { where: query, limit: PAGE_SIZE, page: nextPage, sort: '-createdAt' },
    { addQueryPrefix: true }
  );

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/chats${stringifiedQuery}`, { credentials: 'include' });
    const data = await resp.json();

    const older = data.docs
      .map(msg => ({
        ...msg,
        sender_id: typeof msg.sender_id === 'object' ? msg.sender_id.id : msg.sender_id
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    messages.value = [...older, ...messages.value];
    page.value = nextPage;
    hasMore.value = Boolean(data.hasNextPage);
  } catch (err) {
    console.error("Failed to fetch older messages:", err);
  } finally {
    loadingMore.value = false;
  }
};

// Fetch user info
const getUserInfo = async () => {
  user_id.value = route.params.user_id;

  // Other users' email addresses are not readable by application users, so the
  // chat partner is identified by their username only.
  const partnerRes = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/${user_id.value}`, { credentials: 'include' });
  const partnerData = await partnerRes.json();
  user_username.value = partnerData.username;

  const meRes = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/me`, { credentials: 'include' });
  const meData = await meRes.json();
  me_id.value = meData.user.id;
  me_username.value = meData.user.username;
  me_email.value = meData.user.email;

  await getMessages();
};

// Send message
const sendMessage = async () => {
  if (!messageInput.value.trim()) return;

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/chats`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiver_id: user_id.value,
        message: messageInput.value
      })
    });
    const data = await resp.json();
    messages.value.push({
      ...data.doc,
      sender_id: typeof data.doc.sender_id === 'object' ? data.doc.sender_id.id : data.doc.sender_id
    });
    messageInput.value = '';
    await nextTick();
    scrollToBottom();
  } catch (err) {
    console.error("Failed to send message:", err);
  }
};

// Auto-refresh messages. B7: exponential backoff + pause while the tab is hidden.
let stopPolling = null;
onMounted(async () => {
  await getUserInfo();
  stopPolling = startPolling(getMessages, { baseDelay: 4000, maxDelay: 30000 });
});

onBeforeUnmount(() => { if (stopPolling) stopPolling(); });
</script>

<style scoped>
.chatroom {
  display: flex;
  height: 80vh;
  max-width: 1200px;
  margin: 2rem auto;
  background: #f9f9f9; /* light background */
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 18px rgba(0,0,0,0.1);
}

/* Sidebar */
.sidebar {
  width: 280px;
  background-color: #ffffff; /* light sidebar */
  color: #333;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  transition: transform 0.3s ease-in-out;
  box-shadow: 2px 0 5px rgba(0,0,0,0.05);
}
.back-btn {
  background: #4caf50;
  border: none;
  color: white;
  padding: 0.5rem 0.8rem;
  border-radius: 6px;
  font-weight: 500;
  margin-bottom: 1rem;
  cursor: pointer;
}
.back-btn:hover { background: #45a049; }
.sidebar .sidebar-close {
  display: none;
  margin-top: 2rem;
  background: #ef4444;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 0.8rem;
  cursor: pointer;
}
.sidebar .sidebar-close:hover { background: #dc2626; }

.user-info { text-align: center; margin-bottom: 2rem; }
.me-name { font-size: 1.4rem; margin-bottom: 0.3rem; color: #111827; }
.me-email { font-size: 0.85rem; color: #6b7280; }
.chat-partner { background-color: #e0e7ff; padding: 1rem; border-radius: 8px; text-align: center; }
.partner-name { font-weight: 600; color: #1e3a8a; }

/* Chat main */
.chat-main { flex: 1; display: flex; flex-direction: column; background-color: #f3f4f6; }
.chat-header {
  padding: 1rem;
  background-color: #ffffff;
  border-bottom: 1px solid #ddd;
  font-weight: 600;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}
.menu-toggle {
  display: none;
  font-size: 1.5rem;
  background: none;
  border: none;
  cursor: pointer;
  color: #111827;
}

/* Chat body & footer */
.chat-body { flex: 1; overflow-y: auto; padding: 1rem 2rem; display: flex; flex-direction: column; gap: 0.8rem; }
.chat-message { max-width: 60%; padding: 0.8rem 1rem; border-radius: 12px; word-wrap: break-word; font-size: 0.95rem; position: relative; }
.from-me { align-self: flex-end; background-color: #d1fae5; color: #065f46; border-bottom-right-radius: 0; }
.from-them { align-self: flex-start; background-color: #ffffff; border-bottom-left-radius: 0; color: #111827; border: 1px solid #e5e7eb; }
.chat-time { font-size: 0.75rem; opacity: 0.6; position: absolute; bottom: -18px; right: 10px; }
.chat-footer { display: flex; padding: 1rem; background-color: #ffffff; border-top: 1px solid #ddd; }
.chat-input { flex: 1; padding: 0.7rem 1rem; border-radius: 8px; border: 1px solid #ccc; font-size: 1rem; margin-right: 0.8rem; background-color: #f9f9f9; color: #111827; }
.send-btn { background-color: #4caf50; color: white; border: none; border-radius: 8px; padding: 0 1.5rem; cursor: pointer; transition: background 0.2s; font-weight: 500; }
.send-btn:hover { background-color: #45a049; }

/* Mobile responsiveness */
@media (max-width: 768px) {
  .chatroom {
    flex-direction: column;
    height: 100vh;
    margin: 0;
    border-radius: 0;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    transform: translateX(-100%);
    width: 250px;
    padding: 1rem;
    box-shadow: 2px 0 8px rgba(0,0,0,0.1);
    z-index: 50;
    transition: transform 0.3s ease-in-out;
    background-color: #ffffff;
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .sidebar .sidebar-close { display: block; }
  .menu-toggle { display: inline-block; color: #111827; }

  .chat-main { flex: 1; margin-left: 0; }
  .chat-body { padding: 1rem; }
  .chat-message { max-width: 80%; }
}
</style>