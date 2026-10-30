<template>
  <div class="dashboard">
    <!-- TOPBAR -->
    <header class="topbar">
      <div class="user-info">
        <div class="avatar">{{ username?.charAt(0)?.toUpperCase() }}</div>
        <div class="user-text">
          <h3>{{ username }}</h3>
          <p>{{ email }}</p>
        </div>
      </div>

      <div class="topbar-actions">
        <button class="menu-toggle" @click="toggleSidebar">☰</button>
        <button class="logout-btn" @click="handleLogOut">Logout</button>
      </div>
    </header>

    <!-- MAIN LAYOUT -->
    <div class="main-layout">
      <!-- LEFT SIDEBAR -->
      <aside class="sidebar" :class="{ open: sidebarOpen }">
        <!-- CREATE CHANNEL -->
        <div class="create-channel">
          <input
            v-model="newChannelName"
            type="text"
            placeholder="New channel name..."
          />
          <button @click="createChannel">+</button>
        </div>

        <div class="sidebar-section">
          <h4>Your Channels</h4>
          <div v-if="!loadingChannels && !member_channels.length" class="empty">
            No joined channels
          </div>
          <ul>
            <li
              v-for="ch in member_channels"
              :key="ch.id"
              class="channel-row"
              @click="goToChannel(ch)"
            >
              <span class="channel-name"># {{ ch.channel_name }}</span>
            </li>
          </ul>
        </div>

        <div class="sidebar-section">
          <h4>All Channels</h4>
          <div v-if="loadingChannels">Loading...</div>
          <ul v-else>
            <li v-for="ch in allChannels" :key="ch.id" class="channel-row">
              <span class="channel-name"># {{ ch.channel_name }}</span>
              <button
                v-if="!isMember(ch.id)"
                @click.stop="joinChannel(ch.id)"
                class="join-btn"
              >
                Join
              </button>
              <span v-else class="joined-pill" aria-disabled="true">Joined</span>
            </li>
          </ul>
        </div>
      </aside>

      <!-- RIGHT SECTION -->
      <section class="content-area">
        <h2>Direct Chats</h2>
        <div class="user-search">
          <input
            v-model="userSearch"
            type="text"
            class="search-input"
            placeholder="Search users by username..."
            @input="onUserSearch"
          />
          <p class="hint">Type at least 2 characters to find a user.</p>
        </div>

        <div v-if="loadingUsers" class="loading">Loading users...</div>
        <div v-else-if="!userSearch.trim()" class="empty-state">
          <p class="empty-title">No chat selected</p>
          <p class="empty-text">
            Search for a user above to start a direct chat, or pick a channel from
            the sidebar.
          </p>
        </div>
        <div v-else-if="!otherUsers.length" class="empty">No matching users.</div>
        <div v-else class="user-list">
          <div
            v-for="user in otherUsers"
            :key="user.id"
            class="user-card"
            @click="goToChat(user.id)"
          >
            <div class="user-card-info">
              <div class="avatar small">
                {{ user.username.charAt(0).toUpperCase() }}
              </div>
              <strong class="user-card-name">{{ user.username }}</strong>
            </div>
            <button class="chat-btn">Chat</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import qs from 'qs';
import { useRouter } from 'vue-router';

const router = useRouter();

// Sidebar toggle
const sidebarOpen = ref(false);
const toggleSidebar = () => (sidebarOpen.value = !sidebarOpen.value);

// Reactive state
const username = ref('');
const email = ref('');
const user_id = ref(null);

// Always normalized to `{ id, channel_name }` objects so that neither the
// template nor the route helpers ever receive a raw relationship value.
const member_channels = ref([]);
const allChannels = ref([]);
const otherUsers = ref([]);

const newChannelName = ref('');
const loadingChannels = ref(true);
const loadingUsers = ref(true);

// SEC-013: the user directory is search-based, so the list is only fetched once
// the user has typed a term.
const userSearch = ref('');
let userSearchTimer = null;

// Channel ids as strings: the API may return numbers while route params are
// always strings, and comparing the two directly would never match.
const joinedIds = computed(() => new Set(member_channels.value.map((c) => String(c.id))));

// Methods
const handleLogOut = async () => {
  try {
    await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/logout`, {
      method: "POST",
      credentials: "include"
    });
    router.push("/login");
  } catch (e) {
    alert("Logout failed");
  }
};

const getUser = async () => {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/me`, {
    credentials: "include",
  });

  if (!res.ok) {
    router.push("/login");
    return;
  }

  const data = await res.json();

  // SEC-015 / B2: an unauthenticated or expired session must not throw a
  // TypeError on `data.user`; redirect to the login screen instead.
  if (!data?.user) {
    router.push("/login");
    return;
  }

  username.value = data.user.username;
  email.value = data.user.email;
  user_id.value = data.user.id;

  loadingUsers.value = false;

  await loadChannels();
};

// SEC-013: the directory is a search endpoint (minimum 2 characters). A blank
// term clears the results instead of dumping every registered user.
const onUserSearch = () => {
  if (userSearchTimer) clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(() => {
    getAllUsers();
  }, 300);
};

const getAllUsers = async () => {
  const term = userSearch.value.trim();

  if (term.length < 2) {
    otherUsers.value = [];
    loadingUsers.value = false;
    return;
  }

  loadingUsers.value = true;

  // The directory endpoint returns usernames only — other users' email
  // addresses are not readable by application users (SEC-013).
  const query = qs.stringify({ q: term, limit: 25 });
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/api/penggunas/directory?${query}`,
    { credentials: "include" }
  );

  if (!res.ok) {
    otherUsers.value = [];
    loadingUsers.value = false;
    return;
  }

  const data = await res.json();
  otherUsers.value = (data.docs ?? []).filter(u => u.id !== user_id.value);
  loadingUsers.value = false;
};

const getAllChannels = async () => {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/channels`, {
    credentials: "include",
  });
  const data = await res.json();
  allChannels.value = data.docs ?? [];
  loadingChannels.value = false;
};

// A relationship field is returned at depth: as an object when populated and as
// a bare id when it is not. Both shapes are collapsed to `{ id, channel_name }`.
const normalizeChannel = (value) => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'object') {
    const id = value.id ?? value.value;
    if (id === null || id === undefined) return null;
    return { id, channel_name: value.channel_name ?? '' };
  }

  return { id: value, channel_name: '' };
};

const getMemberChannels = async () => {
  const query = qs.stringify(
    { where: { pengguna_id: { equals: user_id.value } } },
    { addQueryPrefix: true }
  );
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/memberships${query}`, {
    credentials: "include",
  });
  const data = await res.json();
  member_channels.value = (data.docs ?? [])
    .map((m) => normalizeChannel(m.channel_id))
    .filter(Boolean);
};

// Fill in any channel name the membership relationship did not carry, using the
// full channel list as the lookup.
const enrichMemberChannels = () => {
  const byId = new Map(allChannels.value.map((c) => [String(c.id), c]));

  member_channels.value = member_channels.value.map((ch) => ({
    ...ch,
    channel_name: ch.channel_name || byId.get(String(ch.id))?.channel_name || `Channel ${ch.id}`,
  }));
};

const loadChannels = async () => {
  await Promise.all([getAllChannels(), getMemberChannels()]);
  enrichMemberChannels();
};

const createChannel = async () => {
  if (!newChannelName.value.trim()) return alert("Enter a name");
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/channels`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    // The owner is derived from the session server-side (SEC-005).
    body: JSON.stringify({
      channel_name: newChannelName.value,
    }),
  });
  const data = await res.json();
  const newChannel = data.doc;

  // auto join
  await fetch(`${import.meta.env.VITE_API_URL}/api/memberships`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    // The member is derived from the session server-side (SEC-004).
    body: JSON.stringify({
      channel_id: newChannel.id,
    }),
  });

  await loadChannels();
  newChannelName.value = '';
  goToChannel(newChannel.id);
};

const joinChannel = async (id) => {
  await fetch(`${import.meta.env.VITE_API_URL}/api/memberships`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    // The member is derived from the session server-side (SEC-004).
    body: JSON.stringify({
      channel_id: id,
    }),
  });
  await loadChannels();
};

/**
 * Route to a channel by its id only.
 *
 * Passing the channel object itself produced `/channel/[object%20Object]`,
 * because template interpolation stringifies the object.
 */
const goToChannel = (channel) => {
  const id = channel && typeof channel === 'object' ? channel.id : channel;

  if (id === null || id === undefined || id === '') return;

  router.push({ name: 'ChannelChatroom', params: { id: String(id) } });
};

const goToChat = (id) => router.push(`/chat/${id}`);

const isMember = (id) => joinedIds.value.has(String(id));

// Fetch user data on mount
onMounted(() => {
  getUser();
});
</script>

<style scoped>
/* General layout */
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

/* Topbar */
.topbar {
  position: sticky;
  top: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 0.8rem 1.2rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  z-index: 20;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}

.user-text {
  min-width: 0;
}

.user-text h3 {
  margin: 0;
  font-size: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-text p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  background: var(--accent);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}
.avatar.small {
  width: 35px;
  height: 35px;
  font-size: 0.9rem;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: 0 0 auto;
  /* ensure it doesn’t wrap */
  flex-wrap: nowrap;
}

.logout-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-pill);
  padding: 0.4rem 0.9rem;
  cursor: pointer;
}
.logout-btn:hover {
  background: var(--accent-hover);
}

.menu-toggle {
  display: none; /* default hidden */
  background: none;
  border: none;
  font-size: 1.6rem;
  cursor: pointer;
  z-index: 25;
}

/* Mobile screens */
@media (max-width: 768px) {
  .menu-toggle {
    display: block; /* show on mobile */
  }
}


/* Main layout */
.main-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 280px;
  flex: 0 0 280px;
  background: var(--bg);
  border-right: 1px solid var(--border);
  padding: 1rem;
  overflow-y: auto;
  transition: transform 0.3s ease-in-out;
}

.sidebar-section {
  margin-top: 1rem;
}
.sidebar-section h4 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  margin: 0 0 0.5rem;
}
.sidebar-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* Channel rows: name on the left, action on the right. */
.sidebar-section li.channel-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0.5rem 0.7rem;
  margin-bottom: 0.25rem;
  border-radius: var(--radius);
  cursor: pointer;
}
.sidebar-section li.channel-row:hover {
  background: var(--surface);
}

.channel-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.create-channel {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.create-channel input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0 0.7rem;
  height: 38px;
  background: var(--surface);
}
.create-channel input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.create-channel button {
  flex: 0 0 auto;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  width: 38px;
  height: 38px;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}
.create-channel button:hover {
  background: var(--accent-hover);
}

.join-btn {
  flex: 0 0 auto;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-pill);
  padding: 0.25rem 0.8rem;
  cursor: pointer;
  font-size: 0.8rem;
}
.join-btn:hover {
  background: var(--accent-hover);
}

/* Already-joined channels show a non-interactive label instead of Join. */
.joined-pill {
  flex: 0 0 auto;
  padding: 0.25rem 0.8rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.8rem;
  white-space: nowrap;
  cursor: default;
}

.empty {
  color: var(--muted);
  font-size: 0.9rem;
}

/* Content area */
.content-area {
  flex: 1;
  min-width: 0;
  padding: 1.5rem;
  overflow-y: auto;
}

.content-area h2 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
}

.user-search {
  margin-bottom: 1.25rem;
}

.search-input {
  display: block;
  width: 100%;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
}
.search-input::placeholder {
  color: var(--muted);
}
.search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}

.hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--muted);
}

/* Placeholder shown when no direct chat is selected. */
.empty-state {
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 2.5rem 1.25rem;
  text-align: center;
}
.empty-title {
  margin: 0 0 0.35rem;
  font-weight: 600;
}
.empty-text {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.loading {
  color: var(--muted);
}

.user-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: 1rem;
}

.user-card {
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.8rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease;
}
.user-card:hover {
  border-color: var(--accent);
}

.user-card-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.user-card-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-btn {
  flex: 0 0 auto;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-pill);
  padding: 0.35rem 0.9rem;
  font-size: 0.85rem;
  cursor: pointer;
}
.chat-btn:hover {
  background: var(--accent-hover);
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .main-layout {
    flex-direction: column;
  }
  .sidebar {
    position: fixed;
    top: 60px;
    left: 0;
    height: calc(100vh - 60px);
    width: 240px;
    flex: 0 0 auto;
    transform: translateX(-100%);
    z-index: 15;
    border-right: 1px solid var(--border);
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .menu-toggle {
    display: block;
  }
}
</style>
