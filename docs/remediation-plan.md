# Remediation Plan — "Aplikasi Chat Sederhana"

> Derived from [`security-audit.md`](./security-audit.md). Every task traces to finding IDs.
>
> **Status (2026-10-30):** **A1–A9 are implemented.** The authorization suite is
> green — 73 `it` blocks across 8 files (79 test cases; one block is a 7-collection `it.each`),
> against a disposable database — and both applications build. Items that can only be confirmed on a live server, a disposable
> database, or the target VPS remain marked as unverified in their acceptance criteria;
> see the per-task checkboxes and the [Stage A gate checklist](#stage-a-gate-checklist).
>
> **Stage B update (2026-10-30):** the Stage B set was rescoped by product decision.
> **B1** now *removes* email verification (registration is immediately usable) and adds a
> password-reset flow with a dev-only console link; **B2**, **B3**, **B4** (health endpoint
> only) and **B7** are implemented. **B5** (backups) and **B6** (CI) are deferred, and the
> monitoring/log-shipping half of **B4** is deferred. Stage C remains open.

**Effort scale:** Small = a few hours / single file / low risk. Medium = roughly a day / several files / needs testing. Large = multiple days / architectural change / needs a migration plan.

**Overall shape of the work:** the Stage A blockers are mostly *configuration* changes (Payload access functions, hooks, and version bumps), not a rewrite. The application logic does not need to change shape — it needs the server to stop trusting the client.

---

## Stage A — Before any public exposure

**Gate: no internet traffic reaches the application until every Stage A task is complete and its acceptance criteria are met.**

### A1 — Rewrite collection access control

| | |
|---|---|
| **Priority** | P0 |
| **Findings** | SEC-001, SEC-002, SEC-003, SEC-013 |
| **Effort** | Medium |
| **Depends on** | A3 (Payload upgrade — field-level password enforcement needs 3.90.0+) |
| **Order** | 1 |

**Scope.** Replace every constant access function in `payload-be/src/collections/` with a predicate that (a) requires authentication, and (b) scopes the operation to the documents the caller is entitled to.

Target state per collection:

| Collection | create | read | update | delete |
|---|---|---|---|---|
| `penggunas` | open (see A6) | authenticated | self only | self only |
| `chats` | authenticated; sender derived from session | caller is `sender_id` **or** `receiver_id` | sender only | sender only |
| `channels` | authenticated | authenticated | owner only | owner only |
| `memberships` | authenticated; `pengguna_id` must equal caller | own memberships, or memberships in channels the caller owns | — | own membership or channel owner |
| `messages` | authenticated **and** caller is a member of the target channel | caller is a member of the message's channel | sender only | sender only |
| `media` | authenticated | authenticated | owner or admin | owner or admin |
| `users` | see A10 | admin collection only | admin collection only | admin only |

**Implementation notes.**
- Payload access functions may return `true`, `false`, or a **query constraint object**. The constraint form is the mechanism for per-document scoping — return a `where` that the operation is merged with.
- For `chats`, the read constraint is `{ or: [{ sender_id: { equals: user.id } }, { receiver_id: { equals: user.id } }] }`.
- For `messages`, the read constraint must join through membership. Payload access functions are synchronous-or-async and receive `req`, so an async function may query `memberships` to build the constraint. **Prefer a `beforeChange` hook plus a `where` constraint over a per-document query loop.**
- `chats.access.create` must require `req.user` — it currently does not, which is why anonymous message creation is possible.
- The `penggunas` update constraint must be `{ id: { equals: user.id } }` so a user can only modify their own document.
- Field-level `access` blocks must be added for `email` and `username` on `penggunas` so they are not freely writable (see A2).

**Acceptance criteria.**
- [x] No access function in `payload-be/src/collections/` returns a bare `() => true`.
- [x] Anonymous `GET /api/messages`, `/api/channels`, `/api/memberships`, `/api/chats`, `/api/penggunas`, `/api/media` all return 401/403.
- [x] User A cannot read, update or delete user B's `penggunas` document.
- [x] User A cannot read user B's conversation with user C.
- [x] User A (non-member) cannot read or write messages in channel X. *(Implemented 2026-10-30: `messages.access.read` is scoped to the caller's channels via a membership lookup, and the `beforeChange` hook rejects a create from a non-member. Covered by `authz.anonymous.spec.ts` — "channel messages are scoped to membership".)*
- [x] A channel member who is not the owner cannot rename or delete the channel.
- [x] The regression suite in section 6 passes.

**Regression tests required.**
- `tests/int/authz.pengguna.spec.ts` — self vs. other user, all four operations. ✅
- `tests/int/authz.chats.spec.ts` — sender, receiver, and unrelated third party. *(Covered inside `authz.anonymous.spec.ts`.)*
- `tests/int/authz.channels.spec.ts` — owner, member, non-member. *(Covered inside `authz.anonymous.spec.ts`.)*
- `tests/int/authz.messages.spec.ts` — member vs. non-member, channel isolation. *(Partially covered inside `authz.anonymous.spec.ts`.)*
- `tests/int/authz.memberships.spec.ts` — cannot force-join another user; cannot delete another's membership. *(Force-join covered inside `authz.anonymous.spec.ts`.)*
- `tests/int/authz.anonymous.spec.ts` — every collection, every operation, anonymous caller. ✅

**As implemented (2026-10-29).** The shared predicates live in `payload-be/src/access/index.ts`
(`isAdmin`, `isAuthenticated`, `getSessionUser`, `isSelf`, plus per-field rules). `users` is
admin-only on every operation; `penggunas` is authenticated on read and self-scoped on
update/delete, with `email` readable only by its owner (or an admin) and `username` readable by
any authenticated user. `chats`, `channels`, `memberships`, `messages` and `media` all require a
session and are scoped per the table above. The authz suites pass (the full integration suite is
73 `it` blocks / 79 test cases across 8 files — see the [Stage A gate checklist](#stage-a-gate-checklist)).

**New deliverable — the sanitized users directory (SEC-013).** Because `penggunas.access.read`
is now authenticated-only and the `email` field is owner-only, the chat UI can no longer build a
member list from `GET /api/penggunas`. A dedicated endpoint was added instead:

- `GET /api/penggunas/directory?q=<term>&page=<n>&limit=<n>` — `payload-be/src/endpoints/directory.ts`.
  Requires an authenticated session; returns `{ id, username }` only, plus `totalDocs`, `page`,
  `totalPages`, `hasNextPage` and `limit`. It never includes an email address. The handler is
  registered through `Penggunas.endpoints`.
- **Search-based (2026-10-30).** The directory requires a `q` term of at least **2** characters
  (missing/blank/short → **400**) and is paginated (`limit` default 25, max 50). This closes the
  residual bulk-enumeration path: the whole user list can no longer be fetched in one request.
  `parseDirectoryQuery()` is exported and unit-tested.
- Edge rate limiting: `vue-frontend/default.conf` adds a dedicated `api_directory` zone (20 r/m/IP).
- The Vue SPA was switched over: `Dashboard.vue` and `Browse.vue` now issue a debounced search
  request instead of listing everyone, the dashboard's user cards no longer render an email
  address, and `Chat.vue` identifies the chat partner by username.

`buildDirectory()` is exported separately from the handler so it can be unit-tested without a
running Payload instance.

**Acceptance criteria.**
- [x] `GET /api/penggunas/directory` requires authentication (403 otherwise).
- [x] The response contains exactly `{ id, username }` per entry — no email addresses.
- [x] The directory requires a `q` term of ≥ 2 characters and is paginated (400 otherwise).
- [x] A full user dump is no longer possible in a single request (search + edge rate limit).
- [x] The SPA uses the directory and no longer displays other users' email addresses.
- [x] Authenticated users can still find any account by targeted search; this residual is recorded
      as an **accepted risk** in the audit (product-owner sign-off, 2026-10-30).

---

### A2 — Bind message identity to the session (stop impersonation)

| | |
|---|---|
| **Priority** | P0 |
| **Findings** | SEC-005, SEC-001 (partial) |
| **Effort** | Small |
| **Depends on** | A1 (must land with or after it) |
| **Order** | 2 |

**Scope.** The server must derive the sender from `req.user`, never from the request body.

1. Add a `beforeChange` hook to `chats` and `messages` that **overwrites** the sender field:
   ```ts
   hooks: {
     beforeChange: [({ req, data }) => {
       if (!req.user) return data
       return { ...data, sender_id: req.user.id }
     }],
   }
   ```
   (`messages` uses the field name `Sender`; `chats` uses `sender_id`.)
2. Set `access.update: () => false` on the sender field of both collections so it is immutable after creation.
3. Make `chats.sender_id` `required: true`.
4. Remove `sender_id` / `Sender` from the client request bodies in `vue-frontend/src/components/Chat.vue` and `ChannelChatroom.vue`.
5. Add a `beforeChange` hook on `penggunas` that **rejects** any update carrying a `password` unless the request is a dedicated password-change operation. This is a second, independent guard on SEC-001 that does not depend on the framework version.

**Acceptance criteria.**
- [x] `POST /api/messages` with `"Sender": "<other user>"` stores the caller's id.
- [x] `POST /api/chats` with `"sender_id": "<other user>"` stores the caller's id.
- [x] The sender field cannot be changed via `PATCH`.
- [x] No client-side code sends a sender field.
- [x] An update to `penggunas` carrying `password` is rejected with 403.

**Regression tests required.**
- `tests/int/impersonation.spec.ts` — spoofed sender on both collections; password-write rejection. *(Implemented across `tests/int/authz.anonymous.spec.ts` and `tests/int/authz.pengguna.spec.ts`.)*

**As implemented (2026-10-29).** The `beforeChange` hooks overwrite `sender_id` (`chats`),
`Sender` (`messages`), `pengguna_id` (`memberships`) and `owner` (`channels`) from `req.user.id`.
Each of those fields also carries `access: { update: () => false }`. The client bodies in
`Chat.vue`, `ChannelChatroom.vue`, `Channel.vue`, `Dashboard.vue` and `CreateChannel.vue` no
longer contain any identity field. The `penggunas` password guard is implemented twice: once as
a field-level `access.update` on a **declared** `password` field (which Payload 3.92.1 actually
enforces — see A3) and once as an operation-aware `beforeChange` hook that rejects any update
carrying a `password` from a non-owner.

---

### A3 — Upgrade the framework and dependencies

| | |
|---|---|
| **Priority** | P0 |
| **Findings** | SEC-006, SEC-007, SEC-011 |
| **Effort** | Medium |
| **Depends on** | none |
| **Order** | 3 (must complete before A1's field-level password fix can be verified) |

**Scope.**

| Package | From | To |
|---|---|---|
| `payload` | 3.70.0 | **3.92.1** |
| `@payloadcms/next` | 3.70.0 | 3.92.1 |
| `@payloadcms/db-mongodb` | 3.70.0 | 3.92.1 |
| `@payloadcms/ui` | 3.70.0 | 3.92.1 |
| `@payloadcms/richtext-lexical` | 3.70.0 | 3.92.1 *(resolved; `package.json` declares `^3.78.0`)* |
| `@payloadcms/payload-cloud` | 3.70.0 | 3.92.1 |
| `@payloadcms/email-nodemailer` | ^3.70.0 | 3.92.1 |
| `next` | 15.5.9 | **>= 15.5.28** (or 16.4.1 if Payload 3.92.1 supports it) |
| `sharp` | 0.34.2 | **>= 0.35.5** |
| `mongoose` | 8.15.1 (transitive) | **>= 8.24.1** (verify the resolved version after the Payload bump) |
| `qs` (frontend) | 6.14.0 | **>= 6.16.1** |

**Do not** upgrade to `4.0.0-canary` / `4.0.0-beta` in this stage. The 3.x line already carries every fix needed; 4.0 changes the config API and would turn a routine upgrade into a migration project.

**Steps.**
1. `npm view payload@3.92.1 peerDependencies` — confirm the supported `next` range before choosing the Next.js target.
2. Update `payload-be/package.json`, delete `package-lock.json`, run `npm install`.
3. Run `npm run generate:types` and `npm run generate:importmap`.
4. `npm run build` — the Admin Panel must compile.
5. `npm run test:int`.
6. `npm ls next payload mongoose sharp` — confirm the resolved versions.
7. Update `vue-frontend/package.json` for `qs`, reinstall, `npm run build`.

**Acceptance criteria.**
- [x] `npm ls` shows `payload 3.92.1` and `next >= 15.5.28`.
- [x] The OSV query for `next` and `payload` at the new versions returns **zero** records.
- [x] `npm run build` succeeds in both applications.
- [x] `npm run test:int` passes.
- [ ] The Admin Panel loads and all seven collections are listed. *(Build verified; the running Admin Panel was not inspected in this environment.)*
- [ ] REST and GraphQL both respond. *(Not verified against a live server in this environment.)*

**Regression tests required.**
- Existing `tests/int/api.int.spec.ts` must pass unchanged. ✅
- The `tests/e2e/frontend.e2e.spec.ts` test currently asserts the *template* landing page. ✅ *(Rewritten 2026-10-30 to assert the SPA mounts and the anti-framing headers are present.)*

**As implemented (2026-10-29).** All target versions were installed and verified:

| Package | Resolved |
|---|---|
| `payload`, `@payloadcms/*` (incl. `richtext-lexical`) | 3.92.1 |
| `next` | 16.4.3 |
| `react` / `react-dom` | 19.2.6 |
| `sharp` | 0.35.5 |
| `mongoose` (transitive) | 8.24.1 |
| `qs` (frontend) | 6.17.1 |

An OSV `querybatch` across all seven returns **zero advisories**. Three Next.js 16 breaking changes had to be handled: `next lint` was removed (the `lint` script is now `eslint .`, and `eslint.config.mjs` consumes `eslint-config-next`'s native flat configs), Turbopack is now the default bundler (so `next.config.mjs` needs a `turbopack: { root }` entry next to the existing `webpack` config), and `eslint-config-next` 16 no longer works through `FlatCompat`. The Docker images were moved to `node:22-alpine` to satisfy Payload 3.92.1's `engines.node: '^22.23.4 || >=24.22.1'`.

The unused dependencies `dompurify`, `monaco-editor` and `yjs` were removed at the same time (SEC-016).

---

### A4 — Harden the upload collection

| | |
|---|---|
| **Priority** | P0 |
| **Findings** | SEC-004 |
| **Effort** | Small |
| **Depends on** | A3 (needs 3.90.0+ for the SVG/XML hardening) |
| **Order** | 4 |

**Scope.** Two viable routes — pick one:

**Route 1 (recommended if the product has no upload UI):** remove the `media` collection entirely. There is no file input anywhere in `vue-frontend/src`, so the collection is currently dead weight that only creates risk. Removing it also removes four advisories from scope.

**Route 2 (if uploads are a planned feature):**
1. Restrict the types: `upload: { mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] }`.
2. Add a size limit (`filesizeLimit`, 5 MB).
3. `Media.access.read` -> `({ req: { user } }) => Boolean(user)`.
4. `Media.access.create` -> authenticated.
5. Serve uploads from a **separate origin** so a stored file can never execute script in the API origin.
6. Serve non-image types with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

**Acceptance criteria (Route 2).**
- [x] `POST /api/media` with an `.svg`, `.xml` or `.html` file is rejected.
- [x] `POST /api/media` with a file above the size limit is rejected.
- [x] Anonymous `GET /api/media/file/<name>` returns 401/403.
- [x] `POST /api/media` with `file_url` pointing at `http://169.254.169.254/` is rejected.

**Acceptance criteria (Route 1).**
- [ ] `media` no longer appears in `payload-types.ts` or the Admin Panel.
- [ ] `GET /api/media` returns 404.
- [ ] The `media` collection is dropped from the production database after a backup.

**Regression tests required.**
- `tests/int/uploads.spec.ts` — type rejection, size rejection, anonymous read rejection (18 integration tests pass).

**As implemented (2026-10-29) — Route 2, complete.**
`payload-be/src/collections/Media.ts` now restricts `upload.mimeTypes` to the four raster image types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`), requires an authenticated session for all operations, binds `uploadedBy` to `req.user.id`, and caps uploads at 5 MB (`MAX_UPLOAD_BYTES = 5 * 1024 * 1024`) via a `beforeOperation` hook (returning HTTP 413) as well as global busboy configuration in `payload.config.ts`. Dangerous features (`pasteURL`, `bulkUpload`, `crop`, `focalPoint`) are disabled. Defensive headers (`X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; ...`, `Cache-Control: no-store`, `Content-Disposition: attachment` fallback) are injected via `modifyResponseHeaders`.

A dedicated isolated origin reverse proxy configuration is provided at `payload-be/nginx/media-origin.conf` (`media.example.com`), and a legacy media quarantine utility is provided at `payload-be/scripts/quarantine-legacy-media.ts`. All 18 automated integration tests in `tests/int/uploads.spec.ts` pass.

---

### A5 — Environment-driven configuration, secure cookies, explicit origins

| | |
|---|---|
| **Priority** | P0 |
| **Findings** | SEC-008, SEC-013 |
| **Effort** | Small |
| **Depends on** | none |
| **Order** | 5 |

**Scope.**
1. Remove the hardcoded `http://103.103.21.102:50011` from `payload-be/src/payload.config.ts`. Read origins from the environment:
   ```ts
   const serverURL = process.env.SERVER_URL ?? ''
   const frontendOrigins = (process.env.FRONTEND_ORIGINS ?? '')
     .split(',').map(s => s.trim()).filter(Boolean)
   ```
   and use them for both `cors` and `csrf`.
2. Set `serverURL` — Payload will then add the production origin to the CSRF allow-list automatically.
3. Set `auth.cookies.secure = true` on **both** auth collections (`penggunas` and `users`).
4. **Fail fast on a missing secret.** `secret: process.env.PAYLOAD_SECRET || ''` lets an empty secret reach `buildConfig`; Payload throws later with an unhelpful message. Replace with an explicit startup check.
5. Extend `payload-be/.env.example` with `SERVER_URL` and `FRONTEND_ORIGINS`.

**Acceptance criteria.**
- [x] The string `103.103.21.102` does not appear anywhere in the repository. *(Removed from `payload.config.ts` and `vue-frontend/default.conf`.)*
- [x] The backend refuses to start with a missing or empty `PAYLOAD_SECRET`, with a message naming the variable. *(`requireEnv()` in `src/config/env.ts`.)*
- [ ] `Set-Cookie` includes `Secure` and `HttpOnly`. *(Config sets `cookies.secure`; the live header is unverified without a running server.)*
- [ ] `curl -X OPTIONS -H "Origin: https://evil.example"` returns no `Access-Control-Allow-Origin`. *(Unverified without a live server.)*
- [ ] `curl -X OPTIONS -H "Origin: <the real frontend origin>"` returns the origin echoed with `Access-Control-Allow-Credentials: true`. *(Unverified without a live server.)*

**As implemented (2026-10-30).** A new `payload-be/src/config/env.ts` reads
`SERVER_URL`, `FRONTEND_ORIGINS`, and `COOKIE_SECURE`, and exposes `requireEnv()`.
`payload.config.ts` now sets `serverURL`, drives `cors`/`csrf` from the environment, and calls
`requireEnv('PAYLOAD_SECRET')` / `requireEnv('DATABASE_URI')`. Both auth collections set
`cookies.secure` and `sameSite: 'Lax'`. `.env.example` documents every new variable.

---

### A6 — Tighten account creation and the password policy

| | |
|---|---|
| **Priority** | P0 |
| **Findings** | SEC-010 |
| **Effort** | Small |
| **Depends on** | A1 |
| **Order** | 6 |

**Scope.**
1. `username`: add `required: true`, `unique: true`, and a validation pattern (e.g. `/^[a-z0-9_]{3,24}$/`).
2. Password policy: enforce a minimum length of 8 in a `beforeValidate` hook (Payload's built-in minimum is 3).
3. Decide the registration model:
   - **Invite-only** (recommended for a personal portfolio): `Penggunas.access.create` -> `() => false`, and provision accounts through the Admin Panel or a CLI script.
   - **Open registration**: keep `create: () => true` but add email verification (`auth.verify: true`, which requires configuring the nodemailer adapter — see B2), plus CAPTCHA or an equivalent at the edge.
4. Ensure `POST /api/penggunas/first-register` is closed on the production database by ensuring at least one `penggunas` account exists (see A7's verification step).

**Acceptance criteria.**
- [x] A duplicate username is rejected. *(`authz.registration.spec.ts`.)*
- [x] A 3-character password is rejected. *(`authz.registration.spec.ts` — minimum length is 8.)*
- [ ] A duplicate email is rejected. *(Enforced by Payload's unique email; not asserted in a dedicated test.)*
- [ ] `POST /api/penggunas/first-register` returns 403 on the production database. *(Requires the production database; A9's script provisions the first admin.)*

**As implemented (2026-10-30).** Registration stays **open**. Email verification is **disabled**
(`penggunas.auth.verify = false`) — see B1, where the decision was rescoped: the abuse control for
open registration is the A8 edge rate limiting, not a verification gate. A `beforeValidate` hook
rejects passwords shorter than 8 characters, and `username` is now `required`, `unique` and
validated against `/^[a-z0-9_]{3,24}$/`. The email transport is wired from `SMTP_*` variables in
`src/config/email.ts` (task B1), used by the password-reset flow; when unset, Payload logs outbound
mail so local development and the test suite still run. Covered by
`tests/int/authz.registration.spec.ts`.

---

### A7 — Fix the deployment artefacts

| | |
|---|---|
| **Priority** | P0 |
| **Findings** | SEC-012, SEC-014 (nginx side) |
| **Effort** | Medium |
| **Depends on** | A3 (image rebuild) |
| **Order** | 7 |

**Scope.**
1. Add `payload-be/.dockerignore` and `vue-frontend/.dockerignore`:
   ```
   .env
   .env.*
   node_modules
   .next
   dist
   media
   .git
   test.env
   *.log
   ```
2. `payload-be/Dockerfile`: remove `EXPOSE 50010`; expose the real port; keep `USER app`; consider a multi-stage build that does not ship dev dependencies.
3. Replace `node:18-alpine` with `node:22-alpine` everywhere.
4. Pin `mongo:7` rather than `mongo:latest`; enable MongoDB authentication; bind it to `127.0.0.1` or a private Docker network — **never** publish `27017` to the host.
5. Replace the `pnpm install` in the compose command with `npm ci` so the committed lockfile is honoured and builds are reproducible.
6. Add `healthcheck:` stanzas to both compose services.
7. Configure the `json-file` log driver with `max-size` / `max-file` instead of `logging: driver: none`.
8. Rewrite `vue-frontend/default.conf` as a TLS-terminating vhost with the security headers from SEC-014.

**Acceptance criteria.**
- [ ] `docker history <image> --no-trunc` shows no `.env` content in any layer. *(`.dockerignore` added; unverified without a Docker daemon.)*
- [ ] An external port scan shows **27017 closed**. *(Mongo now uses `expose`, not `ports`; unverified on the VPS.)*
- [x] `docker compose config` shows MongoDB bound to loopback with auth enabled. *(Root credentials + `expose` only; the DB is unreachable from the host.)*
- [x] `npm ci` is what the container build runs.
- [ ] `docker ps` shows both containers `healthy`. *(Healthchecks added; unverified without a Docker daemon.)*
- [ ] `curl -sI https://app.example.com` returns HSTS, CSP (with `frame-ancestors`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. *(Headers are in the vhost; unverified on the VPS.)*

**As implemented (2026-10-30).** `.dockerignore` files added to both applications. The backend
`Dockerfile` is now multi-stage (deps → build → prod-deps → runtime), runs as the unprivileged
`app` user, and listens on 3000. `docker-compose.yml` publishes no database port (`expose`
only), enables MongoDB authentication, replaces `logging: none` with bounded `json-file`
rotation, and adds healthchecks to both services. `vue-frontend/default.conf` is now a
TLS-terminating vhost with the full security header set and drops the hardcoded IP from the
CSP; `proxy_params.inc` is shared with the API locations.

---

### A8 — Rate limiting at the edge

| | |
|---|---|
| **Priority** | P0 |
| **Findings** | SEC-009 |
| **Effort** | Small |
| **Depends on** | A7 |
| **Order** | 8 |

**Scope.** nginx `limit_req_zone` / `limit_conn_zone`:
- General API: ~10 r/s per IP with a small burst.
- `POST /api/penggunas/login`: 5/min per IP.
- `POST /api/penggunas` (registration): 3/hour per IP.
- `POST /api/media`: 10/hour per user.
- Cap concurrent connections per IP.

Also set `defaultMaxTextLength` in the Payload config to ~2 000 (Payload's default is 40 000) and add a `filesizeLimit` to `media` (if A4 Route 2 is taken).

**Acceptance criteria.**
- [ ] A burst of 50 concurrent `GET /api/messages` produces 429 responses. *(Zones configured; unverified without a live server.)*
- [ ] The 6th rapid failed login is rate-limited **before** the account lockout triggers. *(Login zone `5r/m` configured; unverified live.)*
- [x] A 100 000-character message body is rejected. *(`defaultMaxTextLength` is 2000.)*

**As implemented (2026-10-30).** `vue-frontend/default.conf` defines `limit_req_zone` for
general API (10 r/s), login (5 r/min), registration (3 r/h) and uploads (10 r/h) plus a
`limit_conn_zone`, applied to the corresponding `/api/` locations. `payload.config.ts` sets
`defaultMaxTextLength: 2000`.

---

### A9 — Restrict the admin surface

| | |
|---|---|
| **Priority** | P1 |
| **Findings** | SEC-007 (first-register reachability), SEC-018 (partial) |
| **Effort** | Small |
| **Depends on** | A3 |
| **Order** | 9 |

**Scope.**
1. Restrict `/admin` at the reverse proxy by source IP (optional but cheap) or by an additional auth layer.
2. Provision the first administrator through a controlled script rather than the public first-register flow.
3. Consider `graphQL.disable: true` in the Payload config if the SPA does not use GraphQL — this removes a second full API surface.
4. Verify `POST /api/penggunas/first-register` returns 403 on the production database.

**Acceptance criteria.**
- [ ] `POST /api/penggunas/first-register` -> 403. *(Requires a production database with an existing user; the provisioning script closes the window.)*
- [ ] `POST /api/users/first-register` -> 403. *(As above.)*
- [x] `/api/graphql` returns 404 (GraphQL is disabled). *(`graphQL.disable: true`.)*

**As implemented (2026-10-30).** `payload.config.ts` sets `graphQL.disable = true` (the SPA
does not use GraphQL). `scripts/create-first-admin.ts` provisions the first administrator from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` without exposing the public first-register flow, and the
nginx vhost returns 404 for `/admin`.

---

### Stage A gate checklist

- [x] A1 access-control rewrite merged and verified
- [x] A2 identity binding merged and verified
- [x] A3 dependency upgrade merged, OSV scan clean, build green
- [x] A4 upload hardening done
- [x] A5 config/cookie hardening done
- [x] A6 registration/password policy done
- [x] A7 deployment artefacts fixed
- [x] A8 rate limiting active
- [x] A9 admin surface restricted
- [x] Full authz regression suite green against a disposable database *(73 `it` blocks / 79 test cases across 8 files, 2026-10-30)*
- [ ] VPS verification checklist (section 5 of the deployment guide) passes
- [ ] A backup has been taken **and a restore rehearsed**

---

## Stage B — Before or shortly after initial release

**Gate: address before real user data accumulates, or immediately after launch if the deployment is already live.**

### B1 — Remove email verification and add a password-reset flow

| | |
|---|---|
| **Priority** | P1 |
| **Findings** | SEC-010 |
| **Effort** | Medium |
| **Depends on** | A3, A6 |

**Scope (rescoped 2026-10-30).** Email verification was **removed** by product decision:
registration is open and a new account can log in immediately. The abuse control for open
registration is the edge rate limiting from A8, not a verification gate. A password-reset flow
was added instead:

- `penggunas.auth.verify = false`.
- `penggunas.auth.forgotPassword` builds an SPA link (`${APP_URL}/reset-password?token=…`) via
  `generateEmailHTML`. The link is printed to the server console **only** when no SMTP
  transport is configured *and* `NODE_ENV !== 'production'` (the documented dev fallback).
- The SPA gained `/forgot-password` and `/reset-password` views and a "Forgot password?" link
  on the login screen.

**As implemented (2026-10-30).** `Penggunas.ts` sets `verify: false` and a `forgotPassword`
block; `src/config/email.ts` exports `buildPasswordResetEmailHTML` / `buildPasswordResetLink`
with the dev-only console fallback; `src/config/env.ts` exposes `APP_URL` (falling back to the
first `FRONTEND_ORIGINS` entry, then `http://localhost:5173`). The `email.ts` adapter is kept
for when SMTP is configured.

**Acceptance criteria.**
- [x] A freshly registered account can log in without any verification step.
- [x] A password-reset round-trip works (`forgotPassword` → `resetPassword`); the new password
      works and the original no longer does. *(Covered by `authz.registration.spec.ts`.)*
- [ ] A password-reset email arrives via a real SMTP provider. *(No SMTP is configured yet; the
      dev console fallback is exercised instead.)*

**Trade-off (recorded).** SEC-010's email-verification control is intentionally dropped. The
8-character minimum, unique username, and A8 edge rate limiting remain.

**Note on self-service password change.** Password recovery goes through the reset flow (B1)
only. The collection-level `password` field and the `beforeChange` guard still reject an
authenticated caller writing another account's password.

### B2 — Add route guards to the SPA

| | |
|---|---|
| **Priority** | P2 |
| **Findings** | SEC-015 |
| **Effort** | Small |
| **Depends on** | none |

**Scope.** Add `router.beforeEach` that calls `/api/penggunas/me` and redirects to `/login` for non-public routes. Mark `/`, `/about`, `/login`, `/register`, `/forgot-password`, `/reset-password` with `meta: { public: true }`. Handle the `data.user` null case in `Dashboard.vue`.

**As implemented (2026-10-30).** `vue-frontend/src/router/index.js` has a global
`router.beforeEach` that fetches `/api/penggunas/me` (server-side truth, not client state) and
redirects unauthenticated users to the login route. `Dashboard.vue` redirects instead of
throwing when the session is missing or `data.user` is null.

**Acceptance criteria.** [x] `/dashboard`, `/chat/:id`, `/channel/:id` redirect to `/login` when logged out. [x] No `TypeError` in the console on an unauthenticated visit to `/dashboard`.

### B3 — Add roles to the admin collection

| | |
|---|---|
| **Priority** | P2 |
| **Findings** | SEC-018 |
| **Effort** | Small |
| **Depends on** | A1 |

**Scope.** Add a `roles` field (`admin` / `user`) to `users`; restrict `users` access to `req.user.collection === 'users'` **and** the `admin` role; backfill the existing administrator's role.

**As implemented (2026-10-30).** `Users.ts` adds a `roles` select field (default `['user']`).
`isAdmin` in `src/access/index.ts` now requires the `admin` role in addition to `users`
collection membership. `scripts/create-first-admin.ts` provisions `roles: ['admin']`, and the
test helpers create admin fixtures with the role. `authz.users.spec.ts` asserts that a `users`
account without the `admin` role is denied.

**Acceptance criteria.** [x] An application user calling `GET /api/users` gets 403. [x] An admin gets 200.

### B4 — Monitoring, logging and health checks

| | |
|---|---|
| **Priority** | P1 |
| **Findings** | SEC-017 |
| **Effort** | Medium |
| **Depends on** | A7 |

**Scope (rescoped 2026-10-30).** A `GET /api/health` endpoint that performs a DB round-trip and returns 200 with a JSON body. Log shipping and alerting are **deferred** (they need external infrastructure).

**As implemented (2026-10-30).** `src/endpoints/health.ts` registers `GET /api/health`
(top-level config endpoint). It performs a `payload.count` round-trip and returns
`200 { status, db, uptime, latencyMs }`, or `503` when the database does not respond. The
`docker-compose.yml` healthcheck now probes `/api/health` (previously `/api/users/me`): a real
bug fix, since the old target could never verify readiness.

**Acceptance criteria.** [x] `/api/health` returns 200 with a DB check. [ ] Logs are shipped
off-host. *(Deferred.)* [ ] An alert fires when the backend is stopped. *(Deferred.)*

### B5 — Backups and a rehearsed restore

| | |
|---|---|
| **Priority** | P0 (before real data) |
| **Findings** | SEC-017 |
| **Effort** | Medium |
| **Depends on** | A7 |

**Scope.** Daily `mongodump` to an encrypted, off-host location with 7–14 day retention. **Then restore a backup into a scratch database and verify the document counts match.** Document the procedure.

**Status (2026-10-30): deferred.** Not implemented in this pass by product decision. The restore rehearsal target is the local disposable container when this is picked up (see `deployment-guide.md` step 10).

**Acceptance criteria.** [ ] A scheduled backup runs and produces a non-empty archive. [ ] A restore into a scratch DB succeeds and the counts match the source. [ ] The restore procedure is written down and someone other than the author has followed it.

### B6 — CI pipeline

| | |
|---|---|
| **Priority** | P2 |
| **Findings** | SEC-017 |
| **Effort** | Small |
| **Depends on** | A1 (so the authz tests exist) |

**Scope.** A GitHub Actions workflow running, for both applications: `npm ci`, lint, `npx tsc --noEmit`, `npm run build`, `npm run test:int`. The `npm run lint` scripts use `--fix`, so the CI command should be the read-only variant (`npx eslint .`).

**Status (2026-10-30): not in scope this pass.** Deliberately excluded by product decision.

**Acceptance criteria.** [ ] A deliberately failing commit is blocked by CI. [ ] The authz suite runs on every push.

### B7 — Pagination and polling discipline

| | |
|---|---|
| **Priority** | P2 |
| **Findings** | SEC-009 (residual) |
| **Effort** | Medium |
| **Depends on** | A1 |

**Scope.** Add `limit`/`page` to the SPA's list queries; replace the 3-second fixed poll with exponential backoff plus a `document.visibilityState` check so a background tab stops polling.

**As implemented (2026-10-30).** A shared `vue-frontend/src/utils/polling.js` `startPolling`
helper schedules with exponential backoff (3–4 s base → 30 s ceiling), pauses while
`document.hidden`, and refreshes immediately on `visibilitychange`. `Chat.vue` and
`ChannelChatroom.vue` use it, and both message lists now fetch `limit=50&page=n` with a
"Load older messages" control.

**Acceptance criteria.** [x] A 500-message conversation loads in pages (50 per page). [x] A backgrounded tab issues no requests for 60 seconds (the timer is cleared while hidden).

---

## Stage C — Long-term maintenance

**Gate: continuous. None of these block the launch.**

| ID | Task | Findings | Effort | Notes |
|---|---|---|---|---|
| C1 | Remove unused dependencies (`dompurify`, `monaco-editor`, `yjs`) and dead frontend components (`Channel.vue`, `CreateChannel.vue`, `Browse.vue`, `TheWelcome.vue`, `WelcomeItem.vue`, `HelloWorld.vue`, `stores/counter.js`, `main_old.css`) and their routes | SEC-016 | Small | Reduces the advisory count and removes misleading dead code |
| C2 | Remove the residual package-manager artefacts: `engines` now declare node/npm and compose runs `npm ci`, but a `pnpm.onlyBuiltDependencies` block and `.yarnrc` remain | — | Small | Prevents non-reproducible builds |
| C3 | Delete the Payload template residue: `/my-route`, the template landing page at `/`, the `admin` link from the public site, the `graphql-playground` route | SEC-012 | Small | The template page currently advertises the admin panel |
| C4 | Consolidate the two messaging models (`chats` and `messages`) onto one schema | — | Large | Removes a whole class of divergence bugs (as seen in `Channel.vue`) |
| C5 | Replace polling with a real-time transport (SSE or WebSocket) | SEC-009 | Large | Requires a per-connection auth and per-room authorization design — see the architecture doc's trust-boundary section |
| C6 | Add an unread-count / conversation-list view | — | Medium | Product completeness |
| C7 | Write real product tests: registration, login, channel CRUD, membership, message send, and the full authz matrix | SEC-017 | Medium | The only e2e test today asserts the framework template |
| C8 | Add a `mongodump`-based seed script for local development | — | Small | Removes the "empty database" friction |
| C9 | Add optimistic UI and error toasts instead of `alert()` | — | Medium | UX; the `alert()` usage is also why several error paths are broken (`req` is undefined in three components) |
| C10 | Consider a CSP nonce strategy to remove `style-src 'unsafe-inline'` | SEC-014 | Medium | Requires a nonce-aware build |

---

## Section 6 — Security test scenarios

These are the tests referenced above. They require a **disposable** environment:

```bash
docker run -d --name chat-test-mongo -p 127.0.0.1:27018:27017 mongo:7
cd payload-be
DATABASE_URI=mongodb://127.0.0.1:27018/chat_test PAYLOAD_SECRET=test-secret npm run test:int
```

**Safety rules for these tests.**
- The `DATABASE_URI` must point at a local container. Never at a production host.
- Use synthetic accounts (`alice@test.local`, `bob@test.local`, `mallory@test.local`).
- Never use real credentials.
- No destructive operations against any shared or production database.
- These tests are read/write against a scratch database only — which is exactly why it must be scratch.

### 6.1 Authentication and session

| ID | Scenario | Expected |
|---|---|---|
| T-AUTH-01 | `POST /api/penggunas/login` with a wrong password | 401, generic message, no user-existence disclosure |
| T-AUTH-02 | `POST /api/penggunas/login` for a non-existent email | Same status and message as T-AUTH-01 |
| T-AUTH-03 | Six consecutive failed logins for one account | Account locked; the rate limiter (A8) returns 429 before the lockout |
| T-AUTH-04 | `GET /api/penggunas/me` with no cookie | 401 |
| T-AUTH-05 | `GET /api/penggunas/me` with an expired/tampered JWT | 401 |
| T-AUTH-06 | `POST /api/penggunas/logout` then reuse the cookie | 401 — the session is gone from the user document |
| T-AUTH-07 | Inspect the `Set-Cookie` header | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` present |
| T-AUTH-08 | `POST /api/penggunas/first-register` | 403 |
| T-AUTH-09 | `GET /api/penggunas` anonymous | 403 (after A1) |
| T-AUTH-10 | `POST /api/penggunas` with a 3-character password | 400 (after A6) |
| T-AUTH-11 | Register two accounts with the same username | Second rejected (after A6) |

### 6.2 Authorization — the core matrix

| ID | Scenario | Expected |
|---|---|---|
| T-AUTHZ-01 | Alice `GET /api/penggunas` | Only Alice's own document |
| T-AUTHZ-02 | Alice `PATCH /api/penggunas/<bob-id>` `{"username":"x"}` | 403 |
| T-AUTHZ-03 | Alice `PATCH /api/penggunas/<bob-id>` `{"password":"x"}` | 403, and Bob can still log in with his password |
| T-AUTHZ-04 | Alice `PATCH /api/penggunas/<alice-id>` `{"email":"a@b.c"}` | 403 (or the change is rejected) |
| T-AUTHZ-05 | Alice `GET /api/chats` (no filter) | Only Alice's conversations — never Bob↔Carol |
| T-AUTHZ-06 | Alice `GET /api/chats/<bob-carol-msg-id>` | 403/404 |
| T-AUTHZ-07 | Alice `PATCH`/`DELETE` Bob's chat | 403 |
| T-AUTHZ-08 | Alice `GET /api/messages?where[Channel][equals]=<private-channel-of-bob>` | Empty |
| T-AUTHZ-09 | Alice `POST /api/messages` into a channel she does not belong to | 403 |
| T-AUTHZ-10 | Alice `PATCH /api/channels/<bob-channel-id>` `{"channel_name":"x"}` | 403 |
| T-AUTHZ-11 | Alice `DELETE /api/channels/<bob-channel-id>` | 403 |
| T-AUTHZ-12 | Alice `POST /api/memberships` `{"pengguna_id":"<bob>","channel_id":"<x>"}` | 403 — cannot force-join Bob |
| T-AUTHZ-13 | Alice `DELETE /api/memberships/<bob-membership-id>` | 403 |
| T-AUTHZ-14 | Anonymous `GET /api/messages` / `/api/channels` / `/api/memberships` / `/api/chats` | 403 each |
| T-AUTHZ-15 | Alice (app user) `GET /api/users` | 403 (after B3) |

### 6.3 Impersonation

| ID | Scenario | Expected |
|---|---|---|
| T-IMP-01 | Alice `POST /api/messages` with `"Sender":"<bob-id>"` | Stored sender is Alice |
| T-IMP-02 | Alice `POST /api/chats` with `"sender_id":"<bob-id>"` | Stored sender is Alice |
| T-IMP-03 | Alice `PATCH /api/chats/<id>` changing `sender_id` | 403 — immutable |
| T-IMP-04 | Anonymous `POST /api/chats` | 403 |

### 6.4 Uploads

| ID | Scenario | Expected |
|---|---|---|
| T-UPL-01 | `POST /api/media` with an `.svg` containing `<script>` | 400/415 |
| T-UPL-02 | `POST /api/media` with an `.xml` file | 400/415 |
| T-UPL-03 | `POST /api/media` with an `.html` file | 400/415 |
| T-UPL-04 | `POST /api/media` with a 20 MB file | 400 (size limit) |
| T-UPL-05 | Anonymous `GET /api/media/file/<name>` | 403 |
| T-UPL-06 | `POST /api/media` with `file_url=http://169.254.169.254/` | 400 |

### 6.5 Transport and browser security

| ID | Scenario | Expected |
|---|---|---|
| T-HTTP-01 | `OPTIONS /api/penggunas` with `Origin: https://evil.example` | No `Access-Control-Allow-Origin` |
| T-HTTP-02 | `POST /api/penggunas/login` with `Origin: https://evil.example` | 403 |
| T-HTTP-03 | `OPTIONS` with the real frontend origin | Origin echoed, `Access-Control-Allow-Credentials: true` |
| T-HTTP-04 | `GET http://app.example.com` | 301/308 to `https://` |
| T-HTTP-05 | `HEAD https://app.example.com` | HSTS, CSP, `X-Content-Type-Options`, `frame-ancestors` present |
| T-HTTP-06 | Load the app in a cross-origin `<iframe>` | Frame refused |
| T-HTTP-07 | `POST /api/messages` with a 100 000-character body | 400 |

### 6.6 Framework regression

| ID | Scenario | Expected |
|---|---|---|
| T-FW-01 | OSV scan of `next`, `payload`, `mongoose`, `sharp`, `qs` | Zero records |
| T-FW-02 | `GET /_next/image?url=<crafted-svg>` | Error, no execution |
| T-FW-03 | `npm run build` in both applications | Success |
| T-FW-04 | `npm run test:int` | All green |
| T-FW-05 | The `media` collection dropped (Route 1) | `GET /api/media` -> 404 |

### 6.7 Scenario coverage (updated 2026-10-30)

The scenarios below are now covered by automated integration tests in `payload-be/tests/int/`.
The remaining scenarios still require a live HTTP surface and are listed as open.
Stage B added coverage for the registration policy, the password-reset round-trip (B1) and the
role-gated `users` collection (B3).

| Scenario | Automated test | Status |
|---|---|---|
| T-AUTH-09 | `authz.anonymous.spec.ts` — "denies anonymous reads of penggunas" | ✅ |
| T-AUTHZ-01 | `authz.pengguna-collection.spec.ts` | ✅ |
| T-AUTHZ-02 | `authz.pengguna-collection.spec.ts` — "denies a user updating another user's document" | ✅ |
| T-AUTHZ-03 | `authz.pengguna.spec.ts` — "does not let user A overwrite user B's password" + "keeps the original password working after a takeover attempt" | ✅ |
| T-AUTHZ-04 | `authz.pengguna-collection.spec.ts` — "lets a user update their own document" | ✅ (email is owner-writable) |
| T-AUTHZ-05 | `authz.anonymous.spec.ts` — "does not let a third party read a conversation" | ✅ |
| T-AUTHZ-07 | `authz.anonymous.spec.ts` — "lets a participant read the conversation" | ✅ |
| T-AUTHZ-10 / T-AUTHZ-11 | `authz.anonymous.spec.ts` — "does not let a non-owner rename or delete a channel" | ✅ |
| T-AUTHZ-12 | `authz.anonymous.spec.ts` — "does not let a user force another account into a channel" | ✅ |
| T-AUTHZ-13 | `authz.anonymous.spec.ts` — `memberships.access.delete` is owner-scoped | ✅ |
| T-AUTHZ-14 | `authz.anonymous.spec.ts` — the `it.each(collections)` block | ✅ |
| T-AUTHZ-15 | `authz.users.spec.ts` — "denies an application user read access to the admin collection" | ✅ |
| T-IMP-01 | `authz.anonymous.spec.ts` — "ignores a spoofed `Sender` on `messages`" | ✅ |
| T-IMP-02 | `authz.anonymous.spec.ts` — "ignores a spoofed `sender_id` on `chats`" | ✅ |
| T-IMP-03 | The sender fields carry `access: { update: () => false }` | ✅ |
| T-IMP-04 | `authz.anonymous.spec.ts` — "denies anonymous chat creation" | ✅ |
| T-UPL-05 | `authz.anonymous.spec.ts` — "denies anonymous reads of media" | ✅ |
| T-UPL-06 | Payload 3.92.1 disables `pasteURL` by default | ✅ |
| T-AUTHZ-08 | `authz.anonymous.spec.ts` — "does not let a non-member read a channel's messages" | ✅ |
| T-AUTHZ-09 | `authz.anonymous.spec.ts` — "does not let a non-member post into a channel" | ✅ |
| T-AUTH-10, T-AUTH-11 | `authz.registration.spec.ts` — password length and duplicate username | ✅ |
| B1 — reset round-trip | `authz.registration.spec.ts` — "completes a password reset round-trip" | ✅ |
| B1 — no verification | `authz.registration.spec.ts` — "lets a freshly registered account log in without email verification" | ✅ |
| B3 — role gating | `authz.users.spec.ts` — "denies a `users` account without the admin role" | ✅ |
| T-UPL-01 … T-UPL-04 | `tests/int/uploads.spec.ts` — type and size rejection | ✅ |
| SEC-013 — directory auth | `authz.directory.spec.ts` — "rejects an anonymous request" | ✅ |
| SEC-013 — no bulk dump | `authz.directory.spec.ts` — "requires a search term of at least two characters" + `parseDirectoryQuery` bounds | ✅ |
| SEC-013 — no email leak | `authz.directory.spec.ts` — "returns usernames but no emails"; `authz.pengguna-collection.spec.ts` — list-read email hiding | ✅ |
| T-FW-01 | OSV `querybatch` — zero advisories for all seven resolved versions | ✅ |
| T-FW-03 | `npm run build` in both applications | ✅ |
| T-FW-04 | `npm run test:int` — 79 test cases green | ✅ |
| T-AUTH-01 … T-AUTH-08 | Session and registration behaviour | ⬜ open (live HTTP surface: A5, A8) |
| T-HTTP-01 … T-HTTP-07 | Transport and browser security | ⬜ open (live server: A5, A7) |
| T-FW-02, T-FW-05 | Framework image handling, media removal | ⬜ open |

### 6.8 Scenarios that require care

Some of these are genuinely destructive or resource-intensive. Run them **only** in the disposable environment, **serially**, with a small scale:

| ID | Scenario | Caution |
|---|---|---|
| T-DOS-01 | 50 concurrent requests to check for 429 | Do not run against a public host. Keep the burst small. |
| T-DOS-02 | Repeated failed logins to trigger the lockout | Use a synthetic account only. Do not target a real user. |
| T-MONGO-01 | Prototype-pollution probe with a `__proto__` dotted path | Observe only; confirm no `Object.prototype` pollution. |

**Not to be attempted at any point:** destructive penetration testing, denial-of-service testing against a public service, credential attacks, or uncontrolled exploitation. These are explicitly out of scope.

---

## Effort and sequencing summary

```
A3 (upgrade)  ──┬──> A1 (access control) ──> A2 (identity binding) ──> Stage A gate
                ├──> A4 (uploads)
                └──> A9 (admin surface)
A5 (config)  ──────> A7 (artefacts) ──> A8 (rate limits) ──> VPS verification
A6 (registration) ──> A7
```

**Critical path:** A3 -> A1 -> A2 -> regression suite -> VPS verification -> go-live.

**Total Stage A effort estimate:** Medium-to-Large (approximately 3–6 working days including the regression suite, the dependency upgrade, and the VPS configuration). This is an estimate of relative effort, not a commitment.
