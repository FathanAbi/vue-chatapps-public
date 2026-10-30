# Layout & Navigation — vue-frontend

> Describes the layout architecture and navigation of the Vue SPA after the
> UI/UX refactor. Route behaviour and API contracts are unchanged.

---

## 1. Layout architecture

`AppLayout.vue` is the parent of every route. It inspects `route.meta.bare`:

- **Bare routes** (`meta.bare: true` — the auth and public screens) render only
  `<RouterView />` and supply their own layout.
- **All other routes** render the authenticated shell:
  `AppHeader` + `AppSidebar` + a `<RouterView />` content region.

```
routes
└── AppLayout (components/layout/AppLayout.vue)
    ├── bare: true  → HomeView (PublicLayout)
    ├── bare: true  → AboutView (PublicLayout)
    ├── bare: true  → LoginView (AuthLayout)
    ├── bare: true  → RegisterView (AuthLayout)
    ├── bare: true  → ForgotPasswordView (AuthLayout)
    ├── bare: true  → ResetPasswordView (AuthLayout)
    ├── DashboardView              → AppHeader + AppSidebar + content
    ├── ChatView                   → AppHeader + AppSidebar + content
    └── ChannelChatroomView        → AppHeader + AppSidebar + content
```

### Shell components

| Component | Responsibility |
|---|---|
| `layout/AppLayout.vue` | Shell frame; owns sidebar open/close, Escape handling, overlay, and the one-time bootstrap (`fetchMe` + `loadChannels`). |
| `layout/AppHeader.vue` | Logo/brand, mobile sidebar toggle, user menu (identity + logout). |
| `layout/AppSidebar.vue` | Channel navigation (active highlighting), channel creation, People search → direct chat. |
| `layout/AuthLayout.vue` | Centered card for unauthenticated screens. |
| `layout/PublicLayout.vue` | Marketing header/footer for the landing and about pages. |

Content pages render a single, standardised region:
- `Dashboard.vue` uses the `.page` / `.page__inner` globals (a padded, scrolling
  column capped at `--content-max`).
- `Chat.vue` and `ChannelChatroom.vue` use a full-height `.thread` layout
  (header / scrolling message body / composer).

---

## 2. Navigation hierarchy

The sidebar has three sections:

1. **Channels** — create control (`+` with an inline input, replacing the old
   `prompt()`), then the channel list. The active channel is derived from
   `route.params.id` and highlighted with `--color-primary`.
2. **Direct messages** — the people the current user has already chatted with,
   derived from the caller's own `chats` (the collection's read access scopes a
   list query to `sender_id = me OR receiver_id = me`, so no server filter is
   needed). Each row shows the participant avatar, username and a truncated
   preview of the most recent message. The open conversation is highlighted when
   `route.name === 'channel'` and `route.params.user_id` matches. The list is
   built from the most recent 100 chats, deduplicated by participant (most
   recent message wins) and capped at 20 entries.
3. **People** — a debounced search over `GET /api/penggunas/directory?q=`
   (minimum 2 characters, email-free). Selecting a user opens `/chat/:user_id`;
   this is also how a brand-new conversation is started.

Each direct-message thread (`Chat.vue`) and channel thread
(`ChannelChatroom.vue`) header carries a back-to-dashboard control.

The header exposes the brand link (→ `/dashboard`), the mobile toggle, and the
user menu (identity + logout). No navigation destinations were invented: every
link corresponds to a real route and a real feature.

---

## 3. Route organisation

| Path | Name | Component | Layout | Auth |
|---|---|---|---|---|
| `/` | `home` | `HomeView` | `PublicLayout` (bare) | public |
| `/about` | `about` | `AboutView` | `PublicLayout` (bare) | public |
| `/login` | `login` | `LoginView` → `Login.vue` | `AuthLayout` (bare) | public |
| `/register` | `register` | `RegisterView` → `Register.vue` | `AuthLayout` (bare) | public |
| `/forgot-password` | `forgot-password` | `ForgotPasswordView` | `AuthLayout` (bare) | public |
| `/reset-password` | `reset-password` | `ResetPasswordView` | `AuthLayout` (bare) | public |
| `/dashboard` | `dashboard` | `DashboardView` → `Dashboard.vue` | App shell | required |
| `/chat/:user_id` | `channel` | `ChatView` → `Chat.vue` | App shell | required |
| `/channel/:id` | `ChannelChatroom` | `ChannelChatroomView` → `ChannelChatroom.vue` | App shell | required |
| `/browse` | `browse` | → redirect to `dashboard` | — | required |
| `/create` | `create` | → redirect to `dashboard` | — | required |

**Route names, params and query parameters are unchanged** from the original
router. `/browse` and `/create` remain valid URLs (redirects), so existing links
and bookmarks keep working.

Removed routes/components (dead or duplicated, not part of the product flow):
`ChannelView` + `Channel.vue` (unrouted), `Browse.vue`/`CreateChannel.vue` and
their views (folded into the dashboard flow), and the Vue-template leftovers
(`TheWelcome`, `WelcomeItem`, `HelloWorld`, `icons/`).

---

## 4. Active navigation behaviour

- The active channel is computed from `route.params.id` and compared as strings
  (`String(ch.id) === activeChannelId`), avoiding the numeric-vs-string mismatch
  the old code had to guard against.
- The active direct message is computed from `route.name === 'channel'` +
  `route.params.user_id`, and highlighted in the Direct messages section.
- `watch(() => route.fullPath, closeSidebar)` closes the mobile drawer on any
  navigation, including browser back/forward.
- The sidebar is driven by the shared store, so it stays in sync no matter which
  route navigated (e.g. joining from the channel room re-renders the list).

---

## 5. Session bootstrap & role-based navigation

- The global guard (`router.beforeEach`) calls `store.fetchMe()` for every
  non-public route and redirects to `/login` when there is no session. The
  result is stored so the shell does not repeat the request.
- `AppLayout` performs a one-time bootstrap (`loadChannels` + `loadConversations`)
  when entering the authenticated shell, and re-runs it if the user navigates from
  a public route into the app.
- Sending a direct message refreshes the conversation list so a new contact
  appears immediately.
- Logout (`store.logout()`) clears the store and navigates to `/login`.

There is a **single application role population** (`penggunas`) for the SPA;
the `users` admin collection is only used by the Payload Admin Panel and is not
part of this UI. Consequently the SPA has no role-based navigation to gate, and
authorization continues to be enforced server-side.
