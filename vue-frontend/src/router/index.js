import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'
import DashboardView from '../views/DashboardView.vue'
import ChatView from '../views/ChatView.vue'
import ChannelChatroom from '@/views/ChannelChatroomView.vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useChatStore } from '@/stores/chat.js'

/**
 * Every route lives under `AppLayout`. Routes whose `meta.bare` is set render
 * outside the authenticated shell (their own AuthLayout / PublicLayout), so
 * public screens never inherit the app header or sidebar.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: HomeView,
          meta: { public: true, bare: true },
        },
        {
          path: 'about',
          name: 'about',
          // route level code-splitting
          // this generates a separate chunk (About.[hash].js) for this route
          // which is lazy-loaded when the route is visited.
          component: () => import('../views/AboutView.vue'),
          meta: { public: true, bare: true },
        },
        {
          path: 'login',
          name: 'login',
          component: LoginView,
          meta: { public: true, bare: true },
        },
        {
          path: 'register',
          name: 'register',
          component: RegisterView,
          meta: { public: true, bare: true },
        },
        {
          path: 'forgot-password',
          name: 'forgot-password',
          component: ForgotPasswordView,
          meta: { public: true, bare: true },
        },
        {
          path: 'reset-password',
          name: 'reset-password',
          component: ResetPasswordView,
          meta: { public: true, bare: true },
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: DashboardView,
        },
        {
          path: 'chat/:user_id',
          name: 'channel',
          component: ChatView,
        },
        {
          path: 'channel/:id',
          name: 'ChannelChatroom',
          component: ChannelChatroom,
        },
        // Legacy routes: preserved so old links keep working, folded into the
        // unified dashboard flow.
        {
          path: 'browse',
          name: 'browse',
          redirect: { name: 'dashboard' },
        },
        {
          path: 'create',
          name: 'create',
          redirect: { name: 'dashboard' },
        },
      ],
    },
  ],
})

/**
 * SEC-015 / B2: route guards.
 *
 * Public routes are marked with `meta.public`. Every other route requires an
 * authenticated session, which is checked against `/api/penggunas/me` rather
 * than any client-side state — the server is the source of truth. The result is
 * pushed into the shared store so the app shell does not repeat the request.
 */
router.beforeEach(async (to) => {
  if (to.meta.public) {
    return true
  }

  try {
    const store = useChatStore()
    const user = await store.fetchMe()

    if (!user) {
      return { name: 'login' }
    }

    return true
  } catch {
    return { name: 'login' }
  }
})

export default router
