import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import qs from 'qs'

const API = import.meta.env.VITE_API_URL

/**
 * A relationship field is returned at depth as an object when populated and as
 * a bare id when it is not. Both shapes are collapsed to `{ id, channel_name }`.
 */
function normalizeChannel(value) {
  if (value === null || value === undefined) return null

  if (typeof value === 'object') {
    const id = value.id ?? value.value
    if (id === null || id === undefined) return null
    return { channelId: value.id ?? value.value, channel_name: value.channel_name ?? '' }
  }

  return { channelId: value, channel_name: '' }
}

/**
 * A participant (`sender_id` / `receiver_id`) is returned at depth as an object
 * when populated and as a bare id when it is not.
 */
function normalizeParticipant(value) {
  if (value === null || value === undefined) return null

  if (typeof value === 'object') {
    const id = value.id ?? value.value
    if (id === null || id === undefined) return null
    return { id, username: value.username ?? '' }
  }

  return { id: value, username: '' }
}

// How many recent chats to scan when deriving the direct-message list.
const CONVERSATION_SCAN = 100
// Upper bound on distinct people shown in the sidebar.
const CONVERSATION_MAX = 20

/**
 * The shared session/navigation state for the authenticated app shell.
 *
 * Extracted from the three components (Dashboard, Chat, ChannelChatroom) that
 * each used to fetch the same current user, channel list and memberships. Only
 * the *ownership* of these fetches moved — every request and query shape is
 * identical to what the components sent before.
 */
export const useChatStore = defineStore('chat', () => {
  const me = ref(null)
  const channels = ref([])
  const memberships = ref([])
  const conversations = ref([])
  const loadingChannels = ref(false)
  const loadingConversations = ref(false)
  const loaded = ref(false)

  const userId = computed(() => me.value?.id ?? null)

  /** Channel ids (as strings) the current user has joined. */
  const joinedIds = computed(() => new Set(memberships.value.map((m) => String(m.channelId))))

  /** The current user's channels, with names filled in from the channel list. */
  const memberChannels = computed(() => {
    const byId = new Map(channels.value.map((c) => [String(c.id), c]))
    return memberships.value.map((m) => ({
      ...m,
      channel_name:
        m.channel_name || byId.get(String(m.channelId))?.channel_name || `Channel ${m.channelId}`,
    }))
  })

  function isMember(id) {
    return joinedIds.value.has(String(id))
  }

  async function fetchMe() {
    const res = await fetch(`${API}/api/penggunas/me`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data?.user) return null
    me.value = data.user
    return data.user
  }

  async function fetchChannels() {
    loadingChannels.value = true
    try {
      const res = await fetch(`${API}/api/channels`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      channels.value = data.docs ?? []
    } finally {
      loadingChannels.value = false
    }
  }

  async function fetchMemberships() {
    if (!userId.value) {
      memberships.value = []
      return
    }

    const query = qs.stringify(
      { where: { pengguna_id: { equals: userId.value } } },
      { addQueryPrefix: true },
    )
    const res = await fetch(`${API}/api/memberships${query}`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    memberships.value = (data.docs ?? [])
      .map((m) => {
        const normalized = normalizeChannel(m.channel_id)
        return normalized ? { id: m.id, ...normalized } : null
      })
      .filter(Boolean)
  }

  /** Load the full sidebar state (channels + the user's memberships). */
  async function loadChannels() {
    await Promise.all([fetchChannels(), fetchMemberships()])
  }

  /**
   * Derive the "people you have chatted with" list from the caller's chats.
   *
   * The `chats` collection read access already scopes a list query to the
   * caller (`sender_id = me OR receiver_id = me`), so no server-side filter is
   * needed. The API returns newest-first, so the first time a participant is
   * seen is their most recent message.
   */
  async function loadConversations() {
    if (!userId.value) {
      conversations.value = []
      return
    }

    loadingConversations.value = true
    try {
      const query = qs.stringify(
        { limit: CONVERSATION_SCAN, sort: '-createdAt', depth: 1 },
        { addQueryPrefix: true },
      )
      const res = await fetch(`${API}/api/chats${query}`, { credentials: 'include' })
      if (!res.ok) return

      const data = await res.json()
      const meId = String(userId.value)
      const byPerson = new Map()

      for (const chat of data.docs ?? []) {
        const sender = normalizeParticipant(chat.sender_id)
        const receiver = normalizeParticipant(chat.receiver_id)
        if (!sender || !receiver) continue

        const other = String(sender.id) === meId ? receiver : sender
        if (String(other.id) === meId) continue

        const key = String(other.id)
        if (byPerson.has(key)) continue // newer message already recorded

        byPerson.set(key, {
          userId: other.id,
          username: other.username || 'Unknown',
          lastMessage: chat.message ?? '',
          lastAt: chat.createdAt ?? null,
        })

        if (byPerson.size >= CONVERSATION_MAX) break
      }

      conversations.value = [...byPerson.values()]
    } finally {
      loadingConversations.value = false
    }
  }

  async function joinChannel(id) {
    await fetch(`${API}/api/memberships`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // The member is derived from the session server-side.
      body: JSON.stringify({ channel_id: id }),
    })
    await loadChannels()
  }

  async function createChannel(name) {
    const res = await fetch(`${API}/api/channels`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // The owner is derived from the session server-side.
      body: JSON.stringify({ channel_name: name }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const newChannel = data.doc

    await fetch(`${API}/api/memberships`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: newChannel.id }),
    })

    await loadChannels()
    return newChannel
  }

  async function logout() {
    try {
      await fetch(`${API}/api/penggunas/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      reset()
    }
  }

  function reset() {
    me.value = null
    channels.value = []
    memberships.value = []
    conversations.value = []
    loaded.value = false
  }

  return {
    me,
    channels,
    memberships,
    conversations,
    loadingChannels,
    loadingConversations,
    loaded,
    userId,
    joinedIds,
    memberChannels,
    isMember,
    fetchMe,
    fetchChannels,
    fetchMemberships,
    loadChannels,
    loadConversations,
    joinChannel,
    createChannel,
    logout,
    reset,
  }
})
