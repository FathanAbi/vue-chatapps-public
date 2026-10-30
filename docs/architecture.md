# Application Architecture — "Aplikasi Chat Sederhana"

> Scope: this document describes the application **as it exists today** in this repository.
> It is a reconstruction from source code, dependency manifests and Git history — not a design proposal.
> Findings about security posture live in [`security-audit.md`](./security-audit.md).

---

## 1. Application overview

A two-tier web chat application:

| Tier | Technology | Role |
|---|---|---|
| **Backend / CMS** | Payload CMS 3.92.1 on Next.js 16.4.3 (App Router) | REST API (GraphQL disabled), MongoDB persistence, Payload Admin Panel, local file uploads |
| **Frontend** | Vue 3.5.22 + Vite 7 (SPA) | User-facing chat UI (channels, direct messages, registration/login) |
| **Database** | MongoDB via `@payloadcms/db-mongodb` 3.92.1 (mongoose 8.24.1) | Document store for all 7 collections |

> **Current state note.** This document was reconstructed from the repository *as audited*
> (commit `1b33cc7`). The remediation in [`remediation-plan.md`](./remediation-plan.md) has since
> changed several behaviours described below — per-document authorization (Stage A), role-gated
> `users` (B3), disabled email verification and an added reset flow (B1), SPA route guards (B2),
> `GET /api/health` (B4), and paginated/backoff polling (B7). Where a paragraph below still
> describes the pre-remediation design, the audit's "Remediation applied" notes are authoritative.

The Vue SPA is a **pure API client**. It holds no session state of its own: authentication is entirely delegated to Payload's local auth strategy using an `HttpOnly` cookie, and every request is made with `credentials: 'include'`.

Two independent auth collections exist:

- `users` — Payload's admin-panel collection (`admin.user = Users.slug`). Carries a `roles` field (`admin` / `user`); only the `admin` role is treated as an administrator (B3).
- `penggunas` (Indonesian for "users") — the **application** collection used by the Vue SPA for registration, login, channels and messaging. Email verification is disabled (B1).

There is **no** real-time transport. "Live" messaging is implemented with polling via
`vue-frontend/src/utils/polling.js`: exponential backoff (3–4 s base → 30 s ceiling) that pauses
while the tab is hidden and refreshes on `visibilitychange` (B7). Message lists are paginated
(`limit=50`).

### Repository shape

This is a **single git repository containing two independent applications** — *not* a workspace/monorepo:

```
vue-chatapps-public/            <- git repo root (single branch: main, 7 commits)
├── payload-be/                  <- Payload CMS backend (npm lockfile; engines declare node/npm)
└── vue-frontend/                <- Vue SPA (npm lockfile)
```

There is no root `package.json`, no workspace tooling, no shared dependency, and **no CI/CD configuration** anywhere in the repository.

---

## 2. Technology stack and detected versions

Versions below are read from the committed `package-lock.json` files (lockfileVersion 3), i.e. **the versions that would actually be installed**, not merely the declared ranges.

### Backend — `payload-be/`

| Package | Declared | Locked | Notes |
|---|---|---|---|
| `payload` | `3.92.1` | 3.92.1 | Core CMS/framework. **Remediated** (A3, SEC-006/007) |
| `@payloadcms/next` | `3.92.1` | 3.92.1 | Next.js integration, REST route handlers |
| `@payloadcms/db-mongodb` | `3.92.1` | 3.92.1 | MongoDB adapter (mongoose) |
| `@payloadcms/ui` | `3.92.1` | 3.92.1 | Admin Panel |
| `@payloadcms/richtext-lexical` | `^3.78.0` | 3.92.x (resolved) | Lexical editor (no richText field is actually used). **Declared range is `^3.78.0`, not pinned to 3.92.1** |
| `@payloadcms/email-nodemailer` | `3.92.1` | 3.92.1 | **Wired** via `src/config/email.ts` (`buildEmailAdapter()`, used by the password-reset flow, B1) |
| `@payloadcms/payload-cloud` | `3.92.1` | 3.92.1 | Plugin registered, but no cloud adapter configured |
| `next` | `16.4.3` | 16.4.3 | **Remediated** (A3, SEC-006) |
| `react` / `react-dom` | `19.2.6` | 19.2.6 | Payload Admin Panel requires React 19 |
| `mongoose` | (transitive) | 8.24.1 | Behind `@payloadcms/db-mongodb`; **remediated** (A3, SEC-011) |
| `sharp` | `0.35.5` | 0.35.5 | Image processing; **remediated** (A3, SEC-011) |
| `graphql` | `^16.8.1` | 16.12.0 | Installed, but the API surface is disabled (`graphQL.disable: true`, A9) |
| `cross-env`, `dotenv` | — | — | Used by npm scripts / test setup |

Tooling: TypeScript 5.7.3, ESLint 9 + `eslint-config-next` (native flat config), Prettier 3.4.2, Vitest 4.x (integration), Playwright 1.63 (e2e). `package.json` also carries an `overrides` block (`happy-dom`, `graphql-scalars`) and a `pnpm.onlyBuiltDependencies` block (`sharp`, `esbuild`, `unrs-resolver`).

> Historical note (as-audited `1b33cc7`): `payload`/`@payloadcms/*` were `3.70.0`, `next` was `15.5.9`, `sharp` `0.34.2`, `mongoose` `8.15.1`, and the unused `dompurify` / `monaco-editor` / `yjs` dependencies were present. Those were removed or upgraded in Stage A (tasks A3, SEC-016).

Declared runtime (`payload-be/package.json` → `engines`): `node ^22.23.4 || >=24.22.1`, `npm >=10`.
The committed lockfile is `package-lock.json` (npm), and `pnpm-lock.yaml` is absent. The Docker Compose command runs `npm ci`, so the committed lockfile is honoured and container builds are reproducible (A7, SEC-012).

### Frontend — `vue-frontend/`

| Package | Declared | Locked | Notes |
|---|---|---|---|
| `vue` | `^3.5.22` | 3.5.22 | SPA framework |
| `vue-router` | `^4.6.3` | 4.6.3 | History-mode routing |
| `pinia` | `^3.0.3` | 3.0.3 | **Only the unused `counter` demo store exists** |
| `qs` | `^6.17.1` | 6.17.1 | Query-string builder for Payload `where` clauses; **remediated** (A3, SEC-011) |
| `vite` | `^7.1.11` | 7.1.12 | Build tool; dev-server advisories apply to dev only |
| `@vitejs/plugin-vue` | `^6.0.1` | 6.0.1 | |

Tooling: ESLint 9 + `eslint-plugin-vue` + `oxlint`, Prettier 3.6.2, `npm-run-all2`.

Declared runtime: `node ^20.19.0 || >=22.12.0`.

### Runtime environment observed

`node v22.18.0`, `npm 10.9.3`, Docker 28.5.1 available. `pnpm` is **not** installed on the audit host. Neither `node_modules` directory was present at the start of the audit.

---

## 3. Repository structure

### Backend (`payload-be/`)

```
payload-be/
├── src/
│   ├── payload.config.ts        # Payload configuration (CORS, CSRF, collections, db, plugins)
│   ├── payload-types.ts         # Auto-generated by Payload — DO NOT EDIT
│   ├── app/
│   │   ├── (frontend)/          # Next.js route group: template landing page
│   │   │   ├── page.tsx         # "Welcome to your new project." template page
│   │   │   ├── layout.tsx
│   │   │   └── styles.css
│   │   ├── (payload)/           # Route group mounting the Payload Admin Panel + API
│   │   │   ├── layout.tsx       # RootLayout + server functions
│   │   │   ├── custom.scss      # empty
│   │   │   ├── admin/[[...segments]]/page.tsx   # Admin Panel UI (generated)
│   │   │   └── api/
│   │   │       ├── [...slug]/route.ts   # REST: GET/POST/PATCH/PUT/DELETE/OPTIONS (generated)
│   │   │       ├── graphql/route.ts      # POST /api/graphql
│   │   │       └── graphql-playground/route.ts
│   │   ├── my-route/route.ts    # Unmodified Payload template example route (GET)
│   │   └── (payload)/admin/importMap.js
│   └── collections/             # ← the entire domain model (7 files)
│       ├── Users.ts             # admin auth collection
│       ├── Penggunas.ts         # application auth collection
│       ├── Media.ts             # upload collection
│       ├── Chats.ts             # direct messages
│       ├── Channels.ts          # channels
│       ├── Memberships.ts       # channel membership join
│       └── Messages.ts          # channel messages
├── tests/
│   ├── int/api.int.spec.ts      # vitest — one smoke test ("fetches users")
│   └── e2e/frontend.e2e.spec.ts # playwright — asserts the Payload template homepage
│   │   ├── endpoints/
│   │   │   ├── directory.ts      # GET /api/penggunas/directory (search-based, SEC-013)
│   │   │   └── health.ts         # GET /api/health, DB round-trip (B4)
│   │   └── config/
│   │       ├── env.ts            # SERVER_URL / FRONTEND_ORIGINS / COOKIE_SECURE / requireEnv (A5)
│   │       └── email.ts          # buildEmailAdapter() + password-reset email (B1)
│   └── access/
│       └── index.ts             # shared access predicates (isAdmin, isSelf, ...) (A1)
├── tests/
│   ├── int/                     # 8 files, 74 test blocks (authz.*, uploads, api.int, helpers)
│   └── e2e/frontend.e2e.spec.ts # playwright — asserts the SPA mounts + anti-framing headers
├── next.config.mjs              # withPayload() wrapper + webpack extension aliases + turbopack root
├── vitest.config.mts            # node env 'int' project, include tests/int/**/*.spec.ts
├── playwright.config.ts         # webServer starts the dev server
├── tsconfig.json                # paths: @/* -> ./src/*, @payload-config -> ./src/payload.config.ts
├── eslint.config.mjs, .prettierrc.json
├── Dockerfile                   # node:22-alpine, multi-stage (deps/build/prod-deps/runtime), USER app
├── docker-compose.yml           # payload (node:22-alpine, npm ci) + mongo:7 (auth, not published)
├── .env.example                 # DATABASE_URI, PAYLOAD_SECRET, SERVER_URL, FRONTEND_ORIGINS, SMTP_*
├── .npmrc                       # legacy-peer-deps=true
├── .yarnrc                      # --install.ignore-engines true
├── .dockerignore                # excludes .env / node_modules / .next / media
├── nginx/media-origin.conf      # isolated media origin (SEC-004)
├── scripts/                     # create-first-admin.ts, quarantine-legacy-media.ts
└── package.json / package-lock.json
```

Files marked "generated" are rewritten by `payload generate:importmap` / `payload generate:types`; they are not application source.

### Frontend (`vue-frontend/`)

```
vue-frontend/
├── src/
│   ├── main.js                  # createApp + Pinia + Router
│   ├── App.vue                  # <RouterView/> only
│   ├── env.d.ts
│   ├── router/index.js          # AppLayout + child routes + global beforeEach guard (B2 / SEC-015)
│   ├── stores/chat.js           # shared session/channel/membership store
│   ├── utils/polling.js         # startPolling: exponential backoff + visibility pause (B7)
│   ├── components/
│   │   ├── ui/                  # AppIcon, BaseButton/Input/Avatar/Card/Badge,
│   │   │                        # EmptyState, LoadingIndicator, PageHeader
│   │   ├── layout/              # AppLayout, AppHeader, AppSidebar, AuthLayout, PublicLayout
│   │   ├── Login.vue            # login form (AuthLayout)
│   │   ├── Register.vue         # registration form (AuthLayout)
│   │   ├── Dashboard.vue        # dashboard overview (shared app shell)
│   │   ├── Chat.vue             # direct-message thread (paginated, backoff polling)
│   │   ├── ChannelChatroom.vue  # channel message thread (used by /channel/:id)
│   ├── views/                   # HomeView, AboutView, LoginView, RegisterView,
│   │   │                        # ForgotPasswordView, ResetPasswordView, DashboardView,
│   │   │                        # ChatView, ChannelChatroomView
│   └── assets/                  # main.css (design tokens)
├── public/favicon.ico
├── index.html                   # title: "Aplikasi Chat Sederhana"
├── vite.config.js               # @ alias -> ./src, outDir: dist
├── eslint.config.js, .prettierrc.json, .editorconfig, .gitattributes
├── Dockerfile                   # node:22-alpine build -> nginx:alpine (EXPOSE 80 443)
├── default.conf                 # TLS-terminating nginx vhost + security headers (A7/A8)
├── proxy_params.inc             # shared proxy headers for the /api/ locations
└── package.json / package-lock.json
```

> **UI refactor (2026-10-30).** The frontend tree above reflects the unified design system
> (tokens in `assets/main.css`, primitives in `components/ui/`, layouts in `components/layout/`,
> shared state in `stores/chat.js`). The former dead code — `Channel.vue`/`ChannelView.vue`, the
> template leftovers (`TheWelcome.vue`, `WelcomeItem.vue`, `HelloWorld.vue`, `icons/`), the
> `stores/counter.js` demo store, and `assets/base.css`/`assets/main_old.css` — has been removed.
> `Browse.vue`/`CreateChannel.vue` and their views were removed and `/browse` + `/create` are now
> redirects to `/dashboard`. See [`UI_REFACTORING_REPORT.md`](./UI_REFACTORING_REPORT.md),
> [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) and [`LAYOUT_AND_NAVIGATION.md`](./LAYOUT_AND_NAVIGATION.md).
> The paragraphs below describing the pre-refactor layout are retained as the as-audited record.

**Dead code:** `Channel.vue` is imported only by `ChannelView.vue`, which is **not routed** — so both are dead. `TheWelcome.vue`, `WelcomeItem.vue`, `HelloWorld.vue` and `stores/counter.js` are template leftovers, unreachable from the chat product. `BrowseView.vue` and `CreateChannelView.vue` *are* routed (`/browse`, `/create`) and import `Browse.vue` / `CreateChannel.vue`, so those two components remain reachable (even though the product flow does not need them).

### Generated / non-source artifacts

- `payload-be/src/payload-types.ts` — Payload-generated TypeScript interfaces.
- `payload-be/src/app/(payload)/admin/**` and `api/**` route files — Payload-generated.
- `payload-be/src/app/(payload)/admin/importMap.js` — Payload-generated.
- `payload-be/.next/` (build output, gitignored), `vue-frontend/dist/` (build output, gitignored).
- `payload-be/media/` — local upload directory, gitignored.

---

## 4. Component responsibilities

| Component | Responsibility | Notes |
|---|---|---|
| `payload-be/src/payload.config.ts` | Root Payload config: collections, Mongo adapter, CORS/CSRF allow-lists, secret, sharp, plugins, upload parser bounds, `graphQL.disable`, health endpoint | Single source of server-side truth |
| `payload-be/src/access/index.ts` | Shared access predicates (`isAdmin`, `isSelf`, `isAuthenticated`, per-field rules) | Added in Stage A (A1) |
| `payload-be/src/config/env.ts` | Environment-driven config: `SERVER_URL`, `FRONTEND_ORIGINS`, `COOKIE_SECURE`, `APP_URL`, `requireEnv` | A5 / B1 |
| `payload-be/src/config/email.ts` | Nodemailer adapter + password-reset email/link builder | B1 |
| `payload-be/src/endpoints/health.ts` | `GET /api/health` — DB round-trip, 200/503 | B4 |
| `payload-be/src/endpoints/directory.ts` | `GET /api/penggunas/directory` — search-based, email-free | SEC-013 |
| `payload-be/src/collections/*` | The entire domain model and **all** authorization policy | Per-document access + `beforeChange` identity hooks (A1/A2) |
| `payload-be/src/app/(payload)/api/[...slug]/route.ts` | Exposes Payload's REST API | Generated |
| `payload-be/src/app/(payload)/api/graphql/route.ts` | GraphQL route file still present | Generated, but the surface is **disabled** (`graphQL.disable: true`, A9) |
| `payload-be/src/app/(payload)/admin/**` | Payload Admin Panel at `/admin` | Generated; `admin.user = users` |
| `payload-be/src/app/(frontend)/page.tsx` | Unmodified Payload template landing page at `/` | Ships the "Welcome to your new project." text and a link to the admin panel (Stage C3) |
| `payload-be/src/app/my-route/route.ts` | Unmodified template example route | Boots Payload then returns a static JSON string; no auth (Stage C3) |
| `vue-frontend/src/router/index.js` | Route table | Global `beforeEach` guard; `meta.public` routes (B2) |
| `vue-frontend/src/utils/polling.js` | Shared polling helper | Exponential backoff + visibility pause (B7) |
| `vue-frontend/src/views/ForgotPasswordView.vue` / `ResetPasswordView.vue` | Password reset | Public routes (B1) |
| `vue-frontend/src/components/Dashboard.vue` | App shell: profile, channel list, search-based user finder, create/join channel, logout | The de-facto landing page after login (SEC-013) |
| `vue-frontend/src/components/Chat.vue` | Direct messages (1:1) | Backoff polling (4 s base) + pagination |
| `vue-frontend/src/components/ChannelChatroom.vue` | Channel messages + channel list + create/join | Backoff polling (3 s base) + pagination |
| `vue-frontend/src/components/Login.vue` / `Register.vue` | Credentials → `penggunas` collection | `credentials: 'include'` |
| `vue-frontend/src/stores/counter.js` | Pinia demo store | Unused |
| `payload-be/Dockerfile` | Container image for the backend | Multi-stage (deps/build/prod-deps/runtime), `node:22-alpine`, `USER app`, `EXPOSE 3000` |
| `vue-frontend/Dockerfile` | Container image: Vite build → nginx:alpine | Serves `dist/`; `EXPOSE 80 443` |
| `vue-frontend/default.conf` | nginx vhost for the SPA | TLS-terminating, full security headers, rate limit zones (A7/A8) |

---

## 5. Architecture diagram

```mermaid
graph TB
    subgraph Internet["Internet"]
        U["Browser (user)"]
    end

    subgraph VPS["VPS (target deployment)"]
        subgraph Edge["Reverse proxy / TLS terminator"]
            N["nginx<br/>:443 TLS -&gt; :80"]
        end

        subgraph FE["Frontend container / static root"]
            V["Vue 3 SPA (Vite build)<br/>nginx:alpine, port 80<br/>VITE_API_URL -&gt; backend"]
        end

        subgraph BE["Backend container"]
            P["Payload CMS 3.92.1<br/>Next.js 16.4.3<br/>:3000"]
            A["/admin Panel<br/>(users collection)"]
            R["/api REST (GraphQL disabled)"]
        end

        subgraph Data["Data tier"]
            M["MongoDB<br/>@payloadcms/db-mongodb"]
            F["Local filesystem<br/>payload-be/media/"]
        end
    end

    U -->|"HTTPS"| N
    N -->|"/ static assets"| FE
    N -->|"/api, /admin proxy"| P
    FE -->|"REST + cookie<br/>credentials: include"| P
    P --> R
    P --> A
    R --> M
    R --> F
```

### Component diagram — request flow with trust boundaries

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant V as Vue component
    participant N as nginx
    participant P as Payload API
    participant A as Access control
    participant D as MongoDB

    B->>V: user action (send message)
    V->>N: POST /api/messages<br/>{ message, Sender, Channel } + cookie
    N->>P: proxy (HTTPS terminated)
    P->>P: parse cookie, run auth strategies<br/>(local-jwt) -> req.user
    P->>A: collection.access.create(req)
    Note over A: Messages.access.create = isAuthenticated(req)<br/>+ beforeChange requires channel membership
    A-->>P: allow
    P->>P: sender derived from req.user (beforeChange)
    P->>D: insert document
    D-->>P: stored doc
    P-->>V: 201 { doc }
    V->>B: push to local list
```

**Trust-boundary note (as-audited `1b33cc7`):** at audit time step 2 took the sender identity from the **request body** (`Messages.access.create = () => true`), which was SEC-005. This is now remediated (A1/A2): creation requires an authenticated session, the `Sender` is derived from `req.user` in a `beforeChange` hook, and the caller must be a member of the target channel.

---

## 6. Authentication flow

Payload's local strategy with `useSessions: true` (the default).

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant P as Payload API
    participant D as MongoDB

    B->>P: POST /api/penggunas/login { email, password }
    P->>D: find_one penggunas by email
    D-->>P: doc (hash, salt)
    P->>P: PBKDF2-SHA256(password, salt, 25000, 512) + timing-safe scmp
    Note over P: mismatch -> 401 "The email or password provided is incorrect."
    P->>P: sign JWT { collection, id, sid, exp }
    P->>D: append session { id, expiresAt } to user doc
    P-->>B: Set-Cookie: payload-token=...; HttpOnly; Path=/; SameSite=Lax
    Note over P: Secure flag set from COOKIE_SECURE (A5/SEC-008)

    B->>P: GET /api/penggunas/me (cookie)
    P->>P: verify JWT (jose), confirm session id still present
    P-->>B: 200 { user: { id, email, username, ... } }
```

### Verified auth characteristics (Payload 3.92.1)

| Property | Value | Source |
|---|---|---|
| Strategy | Local (PBKDF2) + session-backed JWT | `auth/strategies/local/authenticate.ts` |
| Password hash | `pbkdf2(password, salt, 25000, 512, 'sha256')`, random 32-byte salt | `auth/strategies/local/generatePasswordSaltHash.ts` |
| Comparison | `scmp` (constant-time) | `auth/strategies/local/authenticate.ts` |
| Token lifetime | 7 days (`tokenExpiration` set on `penggunas`) | `Penggunas.ts` |
| Cookie | `HttpOnly`, `Path=/`, `SameSite=Lax`, `Secure` (via `COOKIE_SECURE`) | `Penggunas.ts` / `Users.ts` `auth.cookies` |
| Sessions | `useSessions: true` → session id embedded in JWT and stored on the user document; session missing ⇒ JWT rejected | `auth/strategies/jwt.ts` |
| Login lockout | `maxLoginAttempts: 5`, `lockTime: 600000` ms | `Penggunas.ts` `auth` |
| Email verification | **disabled** (`verify: false`) — deliberate (B1) | `Penggunas.ts` |
| Password reset | `auth.forgotPassword` builds an SPA link; email is sent when `SMTP_*` is configured, otherwise the link is printed to the server console in non-production | `Penggunas.ts` + `config/email.ts` |
| Admin roles | `users.roles` (`admin` / `user`); `isAdmin` requires `admin` | `Users.ts` + `access/index.ts` |
| JWT secret | derived from `PAYLOAD_SECRET` via SHA-256, truncated to 32 chars | `payload/src/index.js` → `this.secret` |
| Username login | disabled (`loginWithUsername: false`) | `authDefaults` |

### Sessions in the SPA

The Vue app never reads the token. Every call uses `credentials: 'include'` so the browser attaches the `HttpOnly` cookie automatically. **No token is stored in `localStorage` or `sessionStorage`** — verified by searching the whole `src/` tree (zero matches).

---

## 7. Message lifecycle

There are **two independent messaging systems** with different data shapes.

### 7.1 Direct messages — `chats` collection

```
Collection: chats
  message      : text
  sender_id    : relationship -> penggunas (hasMany: false)
  receiver_id  : relationship -> penggunas (hasMany: false)
Access: create = () => true ; read = Payload default (Boolean(req.user)) ;
        update/delete = Payload default (Boolean(req.user))
```

Full path for **sending** a DM (`vue-frontend/src/components/Chat.vue:141`):

1. `sendMessage()` reads `messageInput`, `me_id` (from `GET /api/penggunas/me`), `user_id` (from the route).
2. `POST {VITE_API_URL}/api/chats` with body `{ sender_id, receiver_id, message }` and `credentials: 'include'`.
3. nginx proxies to Payload.
4. Payload authenticates the cookie → `req.user` (the *real* identity).
5. `chats.access.create` → `() => true` → **allowed for anyone, including anonymous**.
6. `sender_id` is taken **verbatim from the body**. `req.user` is never consulted for the sender field.
7. Mongo insert.
8. Response `{ doc }`; the SPA pushes the returned doc into its local `messages` array.

Full path for **reading** DMs (`Chat.vue:103`):

1. Every 4 s the SPA issues `GET /api/chats?where[or][0][and][0][sender_id][equals]=<me>&...`.
2. `chats.access.read` falls back to Payload's default → `Boolean(req.user)` → **any authenticated user** passes.
3. The `where` clause is **client-supplied**; the server applies no ownership filter of its own.
4. Payload returns matching docs, sorted client-side by `createdAt`.

> Consequence: the confidentiality of direct messages is enforced **only** by the `where` clause that the client chooses to send. A user who changes the query — or simply asks for the whole collection — receives every DM in the system. Documented as SEC-002.

### 7.2 Channel messages — `messages` collection

```
Collection: messages
  Sender   : relationship -> penggunas (required)
  Channel  : relationship -> channels   (required)
  message  : text (required)
Access: read = () => true ; create = () => true
        update/delete = Payload default (Boolean(req.user))
```

Send path (`vue-frontend/src/components/ChannelChatroom.vue:89`): identical shape — `POST /api/messages` with `{ message, Sender: userId, Channel: channelId }`. `Sender` comes from the client, not from `req.user`.

Read path (`ChannelChatroom.vue:67`): `GET /api/messages?where[Channel][equals]=<channelId>&sort=createdAt&depth=1`, polled every 3 s. `messages.access.read = () => true` ⇒ **anonymous**.

### 7.3 Membership and channel lifecycle

```
Collection: memberships   pengguna_id -> penggunas, channel_id -> channels
Access: read = () => true ; create = () => true ; delete = () => true
```

- **Join**: `POST /api/memberships { pengguna_id, channel_id }` — the joining user id is client-supplied.
- **Auto-join on create**: after creating a channel, the SPA immediately POSTs a membership for itself.
- **Visibility**: `ChannelChatroom.vue` shows the message composer only when `isJoined` is true (`data.docs.length > 0` from a client-side membership query). This is a **UI-only** control — the backend does not require membership to read or write messages.
- **Leave**: the UI has no leave button, but `DELETE /api/memberships/:id` is permitted for any caller.

### 7.4 Message editing and deletion

**Not implemented in the UI and not explicitly authorised in the collections.** `messages` and `chats` do not declare `update`/`delete` access, so both fall back to Payload's default `Boolean(req.user)` — i.e. **any authenticated user can edit or delete any message**, provided they know the document id. There is no ownership check and no editor UI. Documented as SEC-003.

---

## 8. Data model

```mermaid
erDiagram
    USERS ||--o{ MEDIA : "owns (no field link)"
    PENGGUNA ||--o{ CHATS : "sender_id"
    PENGGUNA ||--o{ CHATS : "receiver_id"
    PENGGUNA ||--o{ MESSAGES : "Sender"
    PENGGUNA ||--o{ MEMBERSHIPS : "pengguna_id"
    CHANNELS ||--o{ MESSAGES : "Channel"
    CHANNELS ||--o{ MEMBERSHIPS : "channel_id"
    PENGGUNA ||--o{ CHANNELS : "owner"

    USERS {
        string id PK
        string email UK
        string hash "hidden"
        string salt "hidden"
    }
    PENGGUNA {
        string id PK
        string email UK
        string username
        string hash "hidden"
        string salt "hidden"
    }
    MEDIA {
        string id PK
        string alt
        string url
        string filename UK
        string mimeType
        number filesize
    }
    CHATS {
        string id PK
        string message
        string sender_id FK
        string receiver_id FK
    }
    CHANNELS {
        string id PK
        string channel_name
        string owner FK
    }
    MEMBERSHIPS {
        string id PK
        string pengguna_id FK
        string channel_id FK
    }
    MESSAGES {
        string id PK
        string Sender FK
        string Channel FK
        string message
    }
```

### Collection inventory

> The **effective access** column records the as-audited (`1b33cc7`) behaviour. The **declared access** column records the current code after the Stage A rewrite (A1/A2/B3).

| Collection | Purpose | Key fields | Relationships | Declared access (current) | Effective access (as-audited) |
|---|---|---|---|---|---|
| `users` | Payload Admin Panel accounts | `email` (unique), `roles` (`admin`/`user`), `hash`, `salt` | — | every op → `isAdmin(req)` (admin role required, B3) | create/read/update/delete → `Boolean(req.user)` |
| `penggunas` | Application accounts | `email` (unique), `username` (**unique**, validated), `password` (declared), `hash`, `salt` | — | `create = () => true`; `read = isAuthenticated`; `update`/`delete` = self-only | **anonymous** create/read/update; delete → `Boolean(req.user)` |
| `media` | File uploads | `alt` (required), `uploadedBy`, + generated upload fields | → `penggunas`/`users` | all ops → `isAuthenticated(req)` | **anonymous** read; create/update/delete → `Boolean(req.user)` |
| `chats` | 1:1 direct messages | `message`, `sender_id` (required, immutable), `receiver_id` | → `penggunas` ×2 | `create = isAuthenticated`; read = participant; update/delete = sender | create **anonymous**; read/update/delete → `Boolean(req.user)` |
| `channels` | Chat rooms | `channel_name` (required), `owner` (required, immutable) | → `penggunas` | `create`/`read` = `isAuthenticated`; update/delete = owner | **all four anonymous** |
| `memberships` | User ↔ channel join | `pengguna_id` (immutable), `channel_id` | → `penggunas`, `channels` | `create`/`read`/`update` = `isAuthenticated`; delete = own only | **all three anonymous** |
| `messages` | Channel messages | `Sender` (required, immutable), `Channel`, `message` (all required) | → `penggunas`, `channels` | `create` = `isAuthenticated` + member; read = member's channels; update/delete = sender | **read anonymous**; update/delete → `Boolean(req.user)` |

**Payload's default access control** (from `packages/payload/src/auth/defaultAccess.js`):

```js
const defaultAccess = ({ req: { user } }) => Boolean(user)
```

Any operation whose `access` key is not overridden falls back to this — a **presence** check only, with no notion of ownership, membership or role. After the Stage A rewrite, no collection relies on the fallback for a protected operation.

### Field-level access control

**As-audited, there was none.** Every collection in `payload-be/src/collections/` was unguarded at field level (verified against the Payload 3.70 source). This is now remediated (A1/A2):

- `penggunas.email` carries `read`/`update` field access (`penggunaEmailReadAccess` / `penggunaEmailUpdateAccess`): only the owner or an admin.
- `penggunas.username` carries `read` (any authenticated user) / `update` (owner only) access.
- `penggunas.password` is now **declared** with `access.update = penggunaPasswordUpdateAccess` (owner or admin only); a `beforeChange` hook independently rejects an unauthorised password write. This closes SEC-001.
- `chats.sender_id`, `messages.Sender`, `memberships.pengguna_id`, `channels.owner` and `media.uploadedBy` declare `access.update = () => false` (immutable, identity bound to the session).

### Files and storage

As-audited, `media` had `upload: true` with **no `mimeTypes` restriction**, **no filesize limit** and anonymous read. This is now hardened (A4/SEC-004): `upload.mimeTypes` is restricted to raster types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`), `allowRestrictedFileTypes: false`, `pasteURL: false`, `bulkUpload: false`, `crop`/`focalPoint: false`, a 5 MB cap (`MAX_UPLOAD_BYTES`) enforced in `beforeOperation`, `uploadedBy` bound to the session, and defensive response headers (`nosniff`, sandbox CSP, `Content-Disposition: attachment` for non-raster types). Files are written under `payload-be/media/` and served through `GET /api/media/file/:filename`, which now requires authentication.

---

## 9. API communication flow

### Endpoints consumed by the SPA

| Endpoint | Method | Called from | Collection |
|---|---|---|---|
| `/api/penggunas` | POST | `Register.vue:64` | create account |
| `/api/penggunas/login` | POST | `Login.vue:52` | login |
| `/api/penggunas/logout` | POST | `Dashboard.vue:131` | logout |
| `/api/penggunas/me` | GET | `Chat.vue:127`, `ChannelChatroom.vue:30`, `Dashboard.vue:142` | current user |
| `/api/penggunas/directory` | GET | `Dashboard.vue`, `Browse.vue` | search users (`?q=` ≥ 2 chars, paginated, no email) (SEC-013) |
| `/api/penggunas/:id` | GET | `Chat.vue:122` | single user |
| `/api/chats` | GET / POST | `Chat.vue:103`, `Chat.vue:141` | direct messages |
| `/api/channels` | GET / POST | `Dashboard.vue:163/185`, `ChannelChatroom.vue:39/128` | channels |
| `/api/channels/:id` | GET / PATCH | `Channel.vue:52`, `Channel.vue:215` | channel detail / rename |
| `/api/memberships` | GET / POST / DELETE | `Dashboard.vue:176/198/214`, `ChannelChatroom.vue:57/111/143` | membership |
| `/api/messages` | GET / POST | `ChannelChatroom.vue:67/89`, `Channel.vue:150/182` | channel messages |

### Additional endpoints exposed by the backend that the SPA does not use

| Endpoint | Method | Notes |
|---|---|---|
| `/api/graphql` | POST | **Disabled** — `graphQL.disable: true` in `payload.config.ts` (A9). The route file remains but the surface is off. |
| `/api/graphql-playground` | GET | Disabled in production by Payload default (`disablePlaygroundInProduction: true`) |
| `/api/access` | GET | Access reflection endpoint (used by the Admin Panel) |
| `/api/users/...`, `/api/media/...` | * | REST surface for the admin collection and uploads (now access-controlled) |
| `/admin` | * | Payload Admin Panel. Publicly, the nginx vhost returns **404** for `/admin` (A9) |
| `/my-route` | GET | Unmodified template example route, no auth, returns a static JSON string (Stage C3) |
| `/` | GET | Unmodified template landing page, links to `/admin` (Stage C3) |
| `/api/health` | GET | DB round-trip liveness/readiness, 200/503 (B4) |
| `/api/penggunas/directory` | GET | Search-based, email-free user directory (`?q=` ≥ 2 chars, paginated) (SEC-013) |
| `/api/penggunas/first-register` | POST | Payload default flow; the first admin is provisioned via `scripts/create-first-admin.ts` instead (A9) |
| `/api/penggunas/forgot-password` | POST | Present. An email transport is wired from `SMTP_*` (`src/config/email.ts`); when unset, Payload logs the mail and — in non-production only — prints the reset link to the console (B1) |

### CORS and CSRF

Configured from the environment in `payload-be/src/config/env.ts`:

```ts
export const SERVER_URL = (process.env.SERVER_URL ?? '').trim()
export const FRONTEND_ORIGINS = splitList(process.env.FRONTEND_ORIGINS)
export const CORS_ORIGINS = FRONTEND_ORIGINS
export const CSRF_ORIGINS = Array.from(new Set([...FRONTEND_ORIGINS, ...(SERVER_URL ? [SERVER_URL] : [])]))
```

`payload.config.ts` then sets `serverURL: SERVER_URL || undefined`, `cors: CORS_ORIGINS`, `csrf: CSRF_ORIGINS`. Payload's CORS middleware (`packages/payload/src/utilities/headersWithCors.ts`) sets `Access-Control-Allow-Credentials: true` and echoes the `Origin` for any origin on the allow-list.

> Historical note (as-audited `1b33cc7`): both lists were hardcoded to `['http://103.103.21.102:50011', 'http://localhost:50011', 'http://localhost:5173']` — a plain-HTTP public IP — and `serverURL` was not set. This was SEC-008, now remediated (A5).

### Pagination, limits and validation

- `defaultMaxTextLength` = **2000** (`MAX_TEXT_LENGTH` in `payload.config.ts`; Payload's default is 40 000) — a single message may be up to 2 000 characters (A8).
- `defaultDepth` = 2, `maxDepth` = 10.
- The SPA's message lists now send `limit=50&page=n` and render a "Load older messages" control (B7); the DM and channel-message queries sort client-side over each fetched page.
- `penggunas.username` declares a `validate` pattern (`/^[a-z0-9_]{3,24}$/`) and `required`/`unique`; password length is enforced in a `beforeValidate` hook (A6). Other fields use only `required: true`.
- `beforeChange` hooks derive `sender_id`, `Sender`, `pengguna_id` and `owner` from `req.user` (A2); `penggunas` has `beforeValidate` (password/username) and `beforeChange` (password-write) hooks; `media` has `beforeOperation` (size) and `beforeValidate` (uploadedBy) hooks. There are still no `afterRead` / `afterChange` hooks.

---

## 10. File upload flow

```
Client  : multipart/form-data POST /api/media
            ├─ 'alt'    : text (required)
            └─ 'file'   : binary
Payload : generateFileData()
            ├─ fileTypeFromBuffer()          → real content sniffing (not just the client MIME)
            ├─ checkFileRestrictions()       → blocks exe/dll/bat/php/js/asp/... (RESTRICTED_FILE_EXT_AND_TYPES)
            ├─ validateMimeType()            → strictly enforces raster allow-list: png, jpeg, webp, gif (SEC-004)
            ├─ beforeOperation hook          → enforces 5 MB cap (413 PayloadTooLargeError)
            ├─ beforeValidate hook           → binds uploadedBy to req.user.id
            ├─ getSafeFileName()             → sanitize-filename + uniqueness loop
            └─ sharp                         → image processing (crop/focalPoint disabled)
Storage : local filesystem, payload-be/media/
Serve   : GET /api/media/file/:filename   → Media.access.read = ({ req: { user } }) => Boolean(user)
                                            + modifyResponseHeaders: nosniff, sandbox CSP, no-store
                                            + isolated media origin deployment (media.example.com)
```

**Remediation applied (SEC-004):** Uploads are strictly restricted to raster image MIME types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`). Dangerous vectors (SVG, HTML, XML, PDF, scripts) are rejected. Features enabling SSRF (`pasteURL`) or bulk uploads are disabled. Upload sizes are hard-capped at 5 MB. All operations require an authenticated session (`uploadedBy` is bound to `req.user.id`). Media responses deliver defensive headers (`nosniff`, `sandbox` CSP, `no-store`, `Content-Disposition: attachment` for non-raster fallbacks). Isolated media host proxy configuration (`payload-be/nginx/media-origin.conf`) is provided to isolate execution from the primary application origin.

---

## 11. Error handling and logging

- **Backend**: Payload's default error handling. Non-public errors are replaced with a generic message; the original is logged server-side via Pino. `config.debug` is not enabled.
- **Frontend**: every API call is wrapped in `try/catch`. Failures surface via `alert(error.message)` or `console.error`. Several components (`Browse.vue`, `CreateChannel.vue`, `Channel.vue`) reference an undefined `req` in their error paths (`(await req.json())`), which would throw a `ReferenceError` instead of showing the API error.
- **Logging**: Payload's Pino logger writes to stdout. `docker-compose.yml` now uses the bounded `json-file` log driver (`max-size`/`max-file`) for both services instead of `driver: none`. There is no log shipping and no request-ID correlation.
- **Monitoring**: `GET /api/health` performs a DB round-trip and drives the container healthchecks. No off-host log shipping, metrics or alerting yet (B4, partly deferred).

---

## 12. External services and integrations

| Service | Status | Notes |
|---|---|---|
| MongoDB | **Required** | `DATABASE_URI` env var; `mongooseAdapter` |
| SMTP / email | **Configured when `SMTP_*` is set** | `payload.config.ts` wires `buildEmailAdapter()` (`@payloadcms/email-nodemailer`). When `SMTP_HOST` is empty, Payload logs outbound mail; the password-reset link is also printed to the server console in non-production (B1). Email verification is disabled. |
| Payload Cloud | **Configured but inert** | `payloadCloudPlugin()` is registered; no cloud storage adapter is attached, so uploads stay on local disk |
| Sharp | **Active** | Image processing on upload |
| Lexical editor | Configured, unused | No `richText` field exists in any collection |
| External HTTP calls | **None** | No outbound API calls in application code |
| Telemetry | **Enabled** | Payload's anonymous telemetry (`telemetry: true` default) is not opted out |

---

## 13. Deployment assumptions baked into the repository

The repository contains two container definitions and one nginx vhost. They encode **development-era assumptions** and are not production-ready (details in [`deployment-guide.md`](./deployment-guide.md)).

> The table below preserves the **as-audited** (`1b33cc7`) assumptions. Every row has since been addressed by tasks A5/A7 (Stage A); the "current state" column records the fix.

| Assumption (as-audited) | Where | Current state (remediated) |
|---|---|---|
| Frontend served by nginx on port 80, mapped to host port 50011 | `vue-frontend/Dockerfile`, `default.conf` | `default.conf` is now a TLS-terminating vhost with the full security header set and rate-limit zones (A7/A8) |
| Backend listens on 3000 in dev, 50010 in the image | `docker-compose.yml`, `payload-be/Dockerfile` | Multi-stage Dockerfile, `EXPOSE 3000`; compose maps `3000:3000` (A7) |
| MongoDB reachable on the network and published to the host | `docker-compose.yml` | `expose: 27017` only, MongoDB authentication enabled, `mongo:7` pinned (A7) |
| `pnpm` is the package manager | `package.json`, `docker-compose.yml` | Compose runs `npm ci`; backend `engines` now declare `node`/`npm`. (A `pnpm.onlyBuiltDependencies` block remains harmless.) |
| The frontend reaches the backend at a hardcoded origin | `payload.config.ts` | Origins come from `SERVER_URL` / `FRONTEND_ORIGINS` via `src/config/env.ts`; the hardcoded IP was removed (A5) |
| `DATABASE_URI` and `PAYLOAD_SECRET` come from `.env` | `payload-be/.env.example` | `.env` is gitignored **and** `.dockerignore` files now exclude `.env`/`.env.*` from both images (A7) |
| Node 18 / 20 | `docker-compose.yml`, both Dockerfiles | Both images use `node:22-alpine`; backend `engines` require `^22.23.4 || >=24.22.1` (A3/A7) |

---

## 14. Known architectural limitations

> **Superseded in part (2026-10-30).** Items 1, 2, 4, 5, 6, 7, 11 and 12 have been addressed by the
> Stage A remediation and Stage B work; they are retained here as the audited as-found state,
> with the current status noted inline. Items 3, 8, 9, 10 and 13 remain open (Stage C).

1. ~~**No authorization model.**~~ **Resolved (Stage A).** Per-document access control is
   implemented across all 7 collections, with role-gated `users` (B3).
2. ~~**Identity is client-asserted.**~~ **Resolved (A2).** `sender_id`, `Sender`, `pengguna_id`
   and `owner` are derived from `req.user` in `beforeChange` hooks and are immutable.
3. **No real-time layer.** Polling per open view; each tab now backs off exponentially
   (3–4 s → 30 s) and stops while hidden, but the view is still stale by design (Stage C5).
4. ~~**No pagination in the UI.**~~ **Resolved (B7).** Message lists fetch `limit=50&page=n`
   with a "Load older messages" control.
5. ~~**No rate limiting, at any layer.**~~ **Resolved (A8).** Edge `limit_req`/`limit_conn`
   zones in the nginx vhost.
6. ~~**No input validation.**~~ **Resolved (A6).** Username pattern + uniqueness, 8-character
   password minimum, `defaultMaxTextLength` of 2000.
7. **No email delivery by default.** Password reset is implemented (B1) and works when `SMTP_*`
   is configured; otherwise the reset link is printed to the server console in non-production.
   Email verification is disabled by design.
8. **Two parallel messaging models** (`chats` and `messages`) with different field names,
   different clients, and different access rules — a recurring source of divergence (Stage C4).
9. **Dead and duplicated UI.** Several legacy components remain and post obsolete payload
   shapes (Stage C1).
10. **Template residue shipped to production.** `/` serves the Payload template page and
    `/my-route` is still present (Stage C3).
11. ~~**No automated tests of substance.**~~ **Resolved.** 73 `it` blocks / 79 test cases cover the
    authorization matrix, registration policy, uploads and password reset; the e2e test asserts
    the SPA mounts.
12. ~~**No CI/CD, no health check endpoint, no metrics …**~~ **Partly resolved.** `GET /api/health`
    (DB round-trip) and container healthchecks exist (B4). CI (B6) and backups (B5) are
    deferred; off-host log shipping and alerting are deferred.
13. **Payload Admin Panel is the only CMS surface** and its collection list is the raw domain model with no meaningful access control behind it.
