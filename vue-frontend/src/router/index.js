import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'
import DashboardView from '../views/DashboardView.vue'
import BrowseView from '../views/BrowseView.vue'
import CreateChannelView from '../views/CreateChannelView.vue'
import ChatView from '../views/ChatView.vue'
import ChannelChatroom from '@/views/ChannelChatroomView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { public: true }
    },
    {
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue'),
      meta: { public: true }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true }
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
      meta: { public: true }
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: ForgotPasswordView,
      meta: { public: true }
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: ResetPasswordView,
      meta: { public: true }
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView
    },
    {
      path: '/browse',
      name: 'browse',
      component: BrowseView
    },
    {
      path: '/create',
      name: 'create',
      component: CreateChannelView
    },
    {
      path: '/chat/:user_id',
      name: 'channel',
      component: ChatView
    },
    {
      // The channel view reads `route.params.id` itself, so a hard refresh on
      // `/channel/:id` resolves the channel from the URL alone.
      path: '/channel/:id',
      name: 'ChannelChatroom',
      component: ChannelChatroom,
    },
  ]
})

/**
 * SEC-015 / B2: route guards.
 *
 * Public routes are marked with `meta.public`. Every other route requires an
 * authenticated session, which is checked against `/api/penggunas/me` rather
 * than any client-side state — the server is the source of truth.
 */
router.beforeEach(async (to) => {
  if (to.meta.public) {
    return true
  }

  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/me`, {
      credentials: 'include',
    })

    if (!res.ok) {
      return { name: 'login' }
    }

    const data = await res.json().catch(() => null)

    if (!data?.user) {
      return { name: 'login' }
    }

    return true
  } catch {
    return { name: 'login' }
  }
})

export default router
