# UI/UX Audit — vue-frontend

> Scope: the `vue-frontend` Vue 3 SPA. The Payload CMS backend (`payload-be/`)
> was intentionally left untouched — this is a presentation-layer refactor.
> Written after inspecting the codebase as it existed at the start of the
> refactor. The resulting changes are recorded in
> [`UI_REFACTORING_REPORT.md`](./UI_REFACTORING_REPORT.md).

---

## 1. Technology stack (as found)

| Layer | Technology |
|---|---|
| Framework | Vue 3.5 (Composition API, `<script setup>` + some Options API) |
| Build | Vite 7 |
| Routing | vue-router 4, history mode |
| State | Pinia 3 installed, **only an unused demo store** |
| Styling | Hand-written scoped CSS + a small global stylesheet; **no CSS framework** |
| Components | None — every UI element was bespoke per page |
| Icons | Unicode glyphs (`☰`, `✕`, `←`, `+`) |
| HTTP | `fetch` + `credentials: 'include'` (HttpOnly cookie auth) |
| Utilities | `qs` (Payload `where` clauses), `utils/polling.js` |

Backend: Payload CMS 3.92 on Next.js 16, REST API, MongoDB, HttpOnly-cookie
auth. The SPA is a pure API client and holds no token.

---

## 2. Current UI architecture (as found)

### Layouts

There was **no shared layout**. Each page rendered its own header and/or
sidebar:

| Page | Shell |
|---|---|
| `Dashboard.vue` | Topbar (avatar/username/logout) + left sidebar (create channel, your channels, all channels) + content (user search grid) |
| `Chat.vue` | Its own sidebar (back button, own profile, chat partner) + chat pane — **hardcoded colours** (`#4caf50`, `#f9f9f9`), centred 1200px card at `80vh`, *not* full-screen |
| `ChannelChatroom.vue` | A *third* sidebar (channels list + create) + chat pane, token-based colours |

The three shells had different widths (280 / 280 / 260 px), different markup,
different mobile behaviour and different colour systems.

### Design tokens

Two **incompatible** token sets existed:

- `assets/main.css` — `--accent`, `--bg`, `--surface`, `--border`, `--radius`
  (used by Dashboard + ChannelChatroom).
- `assets/base.css` / `assets/main_old.css` — a `--vt-c-*` / `--color-*` set with
  a `prefers-color-scheme: dark` block. **Dead**: `main_old.css` was never
  imported; `base.css` was imported only by `main_old.css`.

Meanwhile `Login`, `Register`, `ForgotPasswordView`, `ResetPasswordView`,
`TheWelcome` and `Chat` hardcoded yet another palette (`#3b82f6`, `#10b981`,
`#1e293b`, `#64748b`, `#cbd5e1`).

### Navigation

No shared navigation component. Channel lists were reimplemented in
`Dashboard.vue` and `ChannelChatroom.vue`; the "people" search lived in
`Dashboard.vue`'s content area **and** (unrouted) in `Browse.vue`.

### Page structure

- `Dashboard.vue` opened with an `<h2>` and a search grid.
- `ChannelChatroom.vue` used a chat header + message list + composer.
- `Chat.vue` used a bordered card.
- `Browse.vue` / `CreateChannel.vue` were nearly unstyled raw HTML.

No `PageHeader`, loading state or empty state component existed.

---

## 3. Identified inconsistencies

1. **Three app shells** with three sidebars and three mobile patterns.
2. **Two conflicting token systems** plus hardcoded palettes in six files.
3. **Seven header implementations** with different padding/heights/buttons.
4. **Unicode glyphs as the only iconography** — no accessible labels.
5. **Repeated form/card/button CSS** duplicated across four auth screens.
6. **Duplicate functionality**: `/dashboard` (main) vs `/browse` + `/create`
   (legacy, reachable but outside the product flow).
7. **Inconsistent feedback**: `alert()` / `console.error`; no inline errors.
8. **Non-form dialogs**: `ChannelChatroom.vue` used `prompt()` to create a
   channel while `Dashboard.vue` used an inline input.
9. **Inconsistent responsiveness**: `Chat.vue` was an 80vh centred card, the
   others were full-height; breakpoints varied (768 / 1024 / 480).
10. **Dead code / template residue**: `Channel.vue` (+ unrouted `ChannelView`),
    `TheWelcome.vue`, `WelcomeItem.vue`, `HelloWorld.vue`, `icons/`,
    `stores/counter.js`, `base.css`, `main_old.css`, `logo.svg`, and a stale
    `App.vue` global `<style>` plus an unused import.

---

## 4. Reusable components identified

Repeated patterns that justified extraction: button, text input/label/error,
avatar, card, badge, empty state, loading indicator, page header, and the three
layouts (app shell, auth, public).

## 5. Components that needed refactoring

`Dashboard.vue`, `Chat.vue`, `ChannelChatroom.vue`, `Login.vue`, `Register.vue`,
`ForgotPasswordView.vue`, `ResetPasswordView.vue`, `HomeView`/`TheWelcome`,
`AboutView`, `router/index.js`, `assets/main.css`, `App.vue`.

## 6. Recommended target architecture

1. A single **token layer** in `main.css` (colours, type, spacing, radius,
   shadow, layout, motion, z-index).
2. A set of **UI primitives** under `components/ui/`.
3. Three **layouts** under `components/layout/`: `AppLayout` (authenticated
   shell), `AuthLayout`, `PublicLayout`.
4. A **Pinia store** (`stores/chat.js`) for the session/sidebar state that was
   fetched three times.
5. **Nested routes** under `AppLayout` so pages never re-implement the shell.
6. `/browse` and `/create` kept as **redirects** into the unified dashboard.
7. Inline SVG **icon set** (CSP-safe: no external fonts/scripts).
8. Delete dead code and conflicting stylesheets.

## 7. Proposed implementation plan

Executed in dependency order: tokens → primitives → layouts + store → router →
auth pages → app-shell pages → public pages → verification → documentation.
See [`UI_REFACTORING_REPORT.md`](./UI_REFACTORING_REPORT.md) for the outcome.
