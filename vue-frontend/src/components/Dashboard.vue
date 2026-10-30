<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat.js'
import PageHeader from './ui/PageHeader.vue'
import EmptyState from './ui/EmptyState.vue'
import BaseCard from './ui/BaseCard.vue'
import LoadingIndicator from './ui/LoadingIndicator.vue'
import AppIcon from './ui/AppIcon.vue'

const router = useRouter()
const store = useChatStore()

const greeting = computed(() => store.me?.username || 'there')

function goToChannel(id) {
  if (id === null || id === undefined || id === '') return
  router.push({ name: 'ChannelChatroom', params: { id: String(id) } })
}
</script>

<template>
  <div class="page">
    <div class="page__inner">
      <PageHeader
        title="Dashboard"
        :description="`Welcome back, ${greeting}. Pick up a channel or start a direct message.`"
      />

      <section class="overview">
        <h2 class="overview__title">Your channels</h2>

        <LoadingIndicator v-if="store.loadingChannels" label="Loading channels…" />

        <EmptyState
          v-else-if="!store.memberChannels.length"
          icon="hash"
          title="No channels yet"
          text="Create a channel from the sidebar, or open any channel to join it."
        />

        <div v-else class="channel-grid">
          <BaseCard
            v-for="ch in store.memberChannels"
            :key="ch.channelId"
            as="button"
            interactive
            class="channel-card"
            @click="goToChannel(ch.channelId)"
          >
            <AppIcon name="hash" :size="16" />
            <span class="channel-card__name">{{ ch.channel_name }}</span>
          </BaseCard>
        </div>
      </section>

      <section class="overview">
        <h2 class="overview__title">Direct messages</h2>
        <EmptyState
          icon="users"
          title="Start a conversation"
          text="Search for someone by username in the People section of the sidebar, then open a direct chat."
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.overview + .overview {
  margin-top: var(--space-6);
}

.overview__title {
  font-size: var(--fs-lg);
  margin-bottom: var(--space-3);
}

.overview__muted {
  color: var(--color-text-muted);
}

.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
  gap: var(--space-3);
}

.channel-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  font: inherit;
  text-align: left;
  color: var(--color-text);
  border-radius: var(--radius-lg);
}

.channel-card__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
