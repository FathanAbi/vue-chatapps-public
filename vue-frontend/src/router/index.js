import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
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
      component: HomeView
    },
    {
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView
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
    path: '/channel/:id',
    name: 'ChannelChatroom',
    component: ChannelChatroom,
    props: true, // allows route params as props
  },
  ]
})

export default router
