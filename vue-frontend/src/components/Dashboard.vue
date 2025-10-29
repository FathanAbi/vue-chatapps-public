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
          <div v-if="!loadingChannels && !member_channels?.length" class="empty">
            No joined channels
          </div>
          <ul>
            <li
              v-for="(ch, i) in member_channels"
              :key="i"
              @click="goToChannel(ch)"
            >
              # {{ ch.channel_name || ch }}
            </li>
          </ul>
        </div>

        <div class="sidebar-section">
          <h4>All Channels</h4>
          <div v-if="loadingChannels">Loading...</div>
          <ul v-else>
            <li v-for="(ch, i) in allChannels" :key="i">
              <div class="ch-item">
                <span># {{ ch.channel_name }}</span>
                <button
                  v-if="!isMember(ch.id)"
                  @click.stop="joinChannel(ch.id)"
                  class="join-btn"
                >
                  Join
                </button>
                <button
                  v-else
                  @click.stop="goToChannel(ch.id)"
                  class="open-btn"
                >
                  Open
                </button>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <!-- RIGHT SECTION -->
      <section class="content-area">
        <h2>Direct Chats</h2>
        <div v-if="loadingUsers" class="loading">Loading users...</div>
        <div v-else class="user-list">
          <div
            v-for="(user, i) in otherUsers"
            :key="i"
            class="user-card"
            @click="goToChat(user.id)"
          >
            <div class="user-info">
              <div class="avatar small">
                {{ user.username.charAt(0).toUpperCase() }}
              </div>
              <div>
                <strong>{{ user.username }}</strong>
                <p>{{ user.email }}</p>
              </div>
            </div>
            <button class="chat-btn">Chat</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
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

const member_channels = ref([]);
const allChannels = ref([]);
const otherUsers = ref([]);

const newChannelName = ref('');
const loadingChannels = ref(true);
const loadingUsers = ref(true);

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
  const data = await res.json();
  username.value = data.user.username;
  email.value = data.user.email;
  user_id.value = data.user.id;

  await Promise.all([getAllUsers(), getAllChannels(), getMemberChannels()]);
};

const getAllUsers = async () => {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas`, {
    credentials: "include",
  });
  const data = await res.json();
  otherUsers.value = data.docs.filter(u => u.id !== user_id.value);
  loadingUsers.value = false;
};

const getAllChannels = async () => {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/channels`, {
    credentials: "include",
  });
  const data = await res.json();
  allChannels.value = data.docs;
  loadingChannels.value = false;
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
  member_channels.value = data.docs.map(m => m.channel_id);
};

const createChannel = async () => {
  if (!newChannelName.value.trim()) return alert("Enter a name");
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/channels`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel_name: newChannelName.value,
      owner: user_id.value,
    }),
  });
  const data = await res.json();
  const newChannel = data.doc;

  // auto join
  await fetch(`${import.meta.env.VITE_API_URL}/api/memberships`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pengguna_id: user_id.value,
      channel_id: newChannel.id,
    }),
  });

  await Promise.all([getAllChannels(), getMemberChannels()]);
  newChannelName.value = '';
  goToChannel(newChannel.id);
};

const joinChannel = async (id) => {
  await fetch(`${import.meta.env.VITE_API_URL}/api/memberships`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pengguna_id: user_id.value,
      channel_id: id,
    }),
  });
  await getMemberChannels();
};

const goToChannel = (id) => router.push(`/channel/${id}`);
const goToChat = (id) => router.push(`/chat/${id}`);

const isMember = (id) => member_channels.value.includes(id);

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
  background: #f3f4f6;
  font-family: "Inter", sans-serif;
}

/* Topbar */
.topbar {
  position: sticky;
  top: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem 1.2rem;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  z-index: 20;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.user-text h3 {
  margin: 0;
  font-size: 1rem;
}
.user-text p {
  margin: 0;
  font-size: 0.85rem;
  color: #6b7280;
}

.avatar {
  width: 40px;
  height: 40px;
  background: #0077ff;
  color: white;
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
  /* ensure it doesn’t wrap */
  flex-wrap: nowrap;
}

.logout-btn {
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}
.logout-btn:hover {
  background: #b91c1c;
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
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 280px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  padding: 1rem;
  overflow-y: auto;
  transition: transform 0.3s ease-in-out;
}

.sidebar-section {
  margin-top: 1rem;
}
.sidebar-section h4 {
  font-size: 1rem;
  color: #374151;
  margin-bottom: 0.5rem;
}
.sidebar-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sidebar-section li {
  padding: 0.6rem 0.8rem;
  margin-bottom: 0.3rem;
  background: #f9fafb;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sidebar-section li:hover {
  background: #e5e7eb;
}

.create-channel {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.create-channel input {
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0.4rem;
}
.create-channel button {
  background: #0077ff;
  color: white;
  border: none;
  border-radius: 6px;
  width: 36px;
  font-size: 1.2rem;
  cursor: pointer;
}

.join-btn,
.open-btn {
  background: #0077ff;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.3rem 0.7rem;
  cursor: pointer;
  font-size: 0.8rem;
}

/* Content area */
.content-area {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}

.user-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 1rem;
}

.user-card {
  background: white;
  border-radius: 8px;
  padding: 0.8rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s;
}
.user-card:hover {
  transform: scale(1.02);
}

.chat-btn {
  background: #0077ff;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
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
    transform: translateX(-100%);
    z-index: 15;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
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
