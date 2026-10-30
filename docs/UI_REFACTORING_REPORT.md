# UI Refactoring Report — vue-frontend

> Summary of the UI/UX refactor: what changed, what was preserved, how it was
> verified, and what remains. Companion to [`UI_UX_AUDIT.md`](./UI_UX_AUDIT.md)
> (before), [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) and
> [`LAYOUT_AND_NAVIGATION.md`](./LAYOUT_AND_NAVIGATION.md).

Scope: **`vue-frontend` only.** The Payload backend, API contracts, auth
mechanism, database and all business logic were not modified.

---

## 1. Implemented changes

### Design system
- Rewrote `src/assets/main.css` as a single token layer (colour, typography,
  spacing, radius, shadow, layout, motion, z-index) plus a reset and two shared
  layout helpers (`.page`, `.page__inner`).
- Deleted the two conflicting/dead stylesheets (`base.css`, `main_old.css`) and
  the stale global `<style>` + unused import in `App.vue`.
- Added `lang="en"` and a meta description to `index.html`.

### Reusable components (`src/components/ui/`)
`AppIcon`, `BaseButton`, `BaseInput`, `BaseAvatar`, `BaseCard`, `BaseBadge`,
`EmptyState`, `LoadingIndicator`, `PageHeader`.

### Layouts (`src/components/layout/`)
`AppLayout`, `AppHeader`, `AppSidebar`, `AuthLayout`, `PublicLayout`.

### State
- New Pinia store `src/stores/chat.js` owns the session (`me`), channel list and
  memberships — previously fetched independently by three components. All
  requests and query shapes are byte-for-byte identical to the originals.

### Routing
- Introduced a single parent `AppLayout` route with all page routes as children;
  `meta.bare` opt-out for auth/public screens.
- `/browse` and `/create` converted to redirects to `dashboard`.
- Route names, params and the `meta.public` guard contract are unchanged.

### Pages migrated
- `Login.vue`, `Register.vue` → `AuthLayout` + `BaseInput`/`BaseButton`; inline
  error/success banners instead of `alert()`; registration now shows a success
  message on the login screen instead of a blocking alert.
- `ForgotPasswordView.vue`, `ResetPasswordView.vue` → `AuthLayout` + primitives;
  all token/reset logic preserved.
- `Dashboard.vue` → conversation/channel overview using `PageHeader`,
  `BaseCard`, `EmptyState`, `LoadingIndicator`; sidebar owns create/search/join.
- `Chat.vue` → DM thread in the shared shell (header / body / composer);
  polling, pagination and `POST /api/chats` unchanged.
- `ChannelChatroom.vue` → channel thread in the shared shell; removed its own
  sidebar and the `prompt()` create flow (now in the sidebar); endpoint shapes,
  `depth=1`, pagination, polling, membership check and join all preserved.
- `HomeView.vue` (replacing `TheWelcome.vue`) and `AboutView.vue` → `PublicLayout`.

### Removed (dead/duplicate)
`components/Channel.vue`, `views/ChannelView.vue`, `components/Browse.vue`,
`views/BrowseView.vue`, `components/CreateChannel.vue`,
`views/CreateChannelView.vue`, `components/HelloWorld.vue`,
`components/WelcomeItem.vue`, `components/TheWelcome.vue`, `components/icons/`,
`stores/counter.js`, `assets/base.css`, `assets/main_old.css`, `assets/logo.svg`.

---

## 2. Preservation guarantees (verified by inspection)

| Concern | Status |
|---|---|
| Route names, `:user_id` / `:id` params, query params | Unchanged |
| API endpoints and query strings | Unchanged (incl. `qs` `where` clauses) |
| HttpOnly-cookie auth + `credentials: 'include'` | Unchanged |
| Server-derived identity (sender/member/owner) | Unchanged — client never asserts identity |
| Dynamic message sender (DM bubbles), polling backoff | Unchanged (`utils/polling.js` untouched) |
| Pagination (`limit=50`, "Load older messages") | Unchanged |
| Channel membership check + join | Unchanged |
| `/channel/:id` deep-link / hard-refresh | Preserved (`route.params.id` is the source of truth) |
| Route guard (`meta.public` → `/api/penggunas/me`) | Preserved, now also seeds the store |
| `#app` mount + anti-framing headers | Unchanged (`index.html` root, nginx vhost) |

---

## 3. Navigation improvements

- One sidebar for the whole app (channel list + People search + create) instead
  of three bespoke sidebars.
- Reliable active state from `route.params.id` (string-compared).
- Mobile drawer closes on navigation and on Escape; overlay click closes it.
- `/browse` and `/create` redirect into the unified dashboard (no broken links).

## 4. Responsive improvements

- One breakpoint system: 1024 / 768 / 480 (documented in `DESIGN_SYSTEM.md`).
- Off-canvas sidebar with overlay below 1024px; docked above.
- Message bubbles widen on narrow screens; grids collapse to one column.
- `min-width: 0` guards prevent horizontal overflow from long tokens.

## 5. Accessibility improvements

- All icon-only controls carry `aria-label`; decorative SVGs are `aria-hidden`.
- Inputs are always `<label for>`-associated; errors use `role="alert"` and
  `aria-invalid` / `aria-describedby`.
- The user menu is a labelled `aria-haspopup`/`aria-expanded` disclosure with
  Escape-to-close and outside-click dismissal.
- Token-driven `:focus-visible` ring; `aria-busy` on loading buttons;
  `role="status"` loaders.
- `<html lang="en">` set.

---

## 6. Tests performed

| Check | Result |
|---|---|
| `npm run build` (Vite 7 production) | **Pass** — 137 modules, clean |
| `npx oxlint .` (read-only) | **Pass** — 0 issues, 36 files |
| `npx eslint .` (read-only) | **6 errors vs 19 before** — all pre-existing categories (see §7) |
| Vite dev server — `/`, `/src/main.js`, router, store, layouts, channel room, icon | All HTTP 200, modules transform |

Not executable in this environment (require MongoDB + the running backend):
the integration/e2e Playwright suites and live auth/messaging flows. The
build/lint/transform checks above plus the preservation guarantees in §2 cover
the static surface.

## 7. Known issues / pre-existing (not introduced here)

- `vue/multi-word-component-names` fires on `Chat.vue`, `Dashboard.vue`,
  `Login.vue`, `Register.vue` — these names predate the refactor and are kept to
  avoid churn.
- `ChannelChatroom.vue` `<script setup lang="ts">` uses an `interface`, which the
  project's ESLint parser (configured for JS) cannot parse. This was already the
  case before the refactor.
- `vite.config.js` `__dirname` `no-undef` — pre-existing.
- ESLint total dropped from 19 → 6 because the dead components that produced most
  of the warnings were removed.

## 8. Remaining technical debt

- **Theme:** light-only. The token layer makes a future dark theme a contained
  change, but it is intentionally out of scope.
- **Self-hosted font:** the system font stack is used; no webfont is bundled.
- **Legacy design names:** `ChannelChatroom` (route name) and the `channel`
  route name for DMs are quirky but public URLs; renaming was avoided to
  preserve compatibility.
- **Backend template residue** (`/`, `/my-route`, dead rename path in the
  Payload collection) remains in `payload-be/` — out of scope for this
  frontend-only refactor.
- **Two messaging models** (`chats` vs `messages`) remain as they were; only the
  UI around them was unified.

## 9. Follow-up (2026-10-30)

Two additions after the main refactor, both **frontend-only** (no backend, API or
access-control change):

- **Direct-message list.** The sidebar gained a "Direct messages" section listing
  the people the user has already chatted with. `stores/chat.js`
  (`loadConversations`) reads `GET /api/chats?limit=100&sort=-createdAt&depth=1`
  — the `chats` read access already scopes a list query to the caller — derives
  the distinct "other" participant per conversation (deduplicated, most recent
  first, capped at 20) and shows avatar + username + last-message preview. The
  list refreshes on shell bootstrap and after sending a DM.
- **Back-to-dashboard controls.** `Chat.vue` and `ChannelChatroom.vue` headers
  now include an icon back button linking to `/dashboard` (the channel page had
  one before the refactor).

Verification repeated after these changes: `npm run build` clean, `npx oxlint .`
0 issues, `npx eslint .` unchanged at 6 pre-existing errors, dev-server module
transform OK.
