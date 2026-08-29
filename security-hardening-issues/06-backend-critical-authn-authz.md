# (Critical) Authentication & Authorization Gate: Forgeable JWTs, Stub API Keys, and an Unauthenticated Key-Management API

**Epic · Backend · Backend 1 of 5**

## Epic Summary

Authentication is forgeable end-to-end: JWTs fall back to a hardcoded shared secret (`"stellar-privacy-jwt-secret-dev-only"`) after an algorithm that can never succeed, API-key verification is a stub that accepts any well-formed key, and most routers — including the entire HSM/key-management API with master-key rotation and kill-switch controls — are mounted with no authentication at all. These workstreams are coupled: route-wide enforcement (W3) is only meaningful once the JWT/API-key paths (W1/W2) are unforgeable; the HSM/admin route lockdown (W4) depends on the middleware from W3; and the token-lifecycle guarantees (W5) assume the key store from W2. Shipping any one in isolation leaves a parallel bypass open.

## Affected Components

`backend/src/middleware/stellarAuth.ts`, `backend/src/routes/auth.ts`, `backend/src/index.ts`, `backend/src/routes/hsm.ts`, `backend/src/routes/admin.ts`, `backend/src/routes/data.ts`, `backend/src/routes/privacy-budget.ts`, `backend/src/gateway/PrivacyApiGateway.ts`, `backend/src/gateway/APIKeyManager.ts`

---

## Workstream 1 — Single, unforgeable JWT verification path

**Objective:** A forged token must never authenticate, regardless of environment misconfiguration.

**Problem:** `stellarAuth.ts` `authenticateJWT` first tries ES256 with `this.stellarPublicKey` (which defaults to `""`), then falls back to HS256 with `this.jwtSecret` — which itself falls back to the hardcoded `"stellar-privacy-jwt-secret-dev-only"` (constructor default). `routes/auth.ts` signs with the same hardcoded fallback. Anyone with source access signs an HS256 token with arbitrary `sub`, `permissions` (including `admin:access`), and `rateLimitTier`.

**Scope:** `stellarAuth.ts` `authenticateJWT`/constructor, `routes/auth.ts` `signJwt`/`JWT_SECRET`, config in `backend/src/config/env.ts`.

**Implementation:**
1. Remove the HS256 fallback entirely; accept only the Ed25519/ES256 (or explicitly configured) algorithm with the public key sourced exclusively from env — no default value.
2. Remove every hardcoded secret fallback; startup fails fast when `JWT_SECRET`/`STELLAR_PUBLIC_KEY` are absent or equal known defaults (see the secrets epic for the shared validator).
3. Add `algorithms` whitelist to every `jwt.verify` call (including the `/logout` path).
4. Sign JWTs in `auth.ts` with the same managed secret and standardized payload validation.

**Acceptance Criteria:**
1. A forged HS256 token (signed with the known default) is rejected with 401.
2. A token signed with a non-whitelisted algorithm is rejected.
3. Startup fails if the JWT secret is missing or matches a known default.
4. `signJwt` issues tokens that pass `validateJWTPayload` and are accepted by `authenticateJWT`.
5. No `|| "stellar-privacy-jwt-secret-dev-only"` fallback remains anywhere.

**Testing:** Unit tests for forged-token rejection, algorithm whitelist, missing-secret startup failure; integration test that a token minted by `/auth/login` authenticates; a test that a token with `admin:access` forged via the old secret is rejected.

## Workstream 2 — Real API-key authentication (replace the stub)

**Objective:** API keys must be issued, scoped, verifiable, and revocable.

**Problem:** `stellarAuth.ts` `authenticateApiKey` validates only a regex (`stellar_api_v[0-9]+_[a-zA-Z0-9]{32,}`) and an HMAC of the prefix against `this.apiKeySecret` — which defaults to `""`, making the expected hash computable by anyone. `lookupServiceAccount` then returns a hardcoded service account (`id: sa_<8 chars>`, fixed permissions) for any key that passes the regex. There is no key store, no per-key scope, no expiry, no revocation, and the rate limiter additionally accepts `api_key` in the query string (leaking keys into logs/referrers).

**Scope:** `stellarAuth.ts` `authenticateApiKey`/`lookupServiceAccount`/`hashApiKey`, `routes/auth.ts` key issuance, `gateway/APIKeyManager.ts`, `rateLimiter.ts` `extractApiKey`.

**Implementation:**
1. Add an `api_keys` table (key_hash, scope/permissions, rate_limit_tier, organization_id, is_active, expires_at) via a Knex migration; store only salted hashes.
2. Replace `lookupServiceAccount` with a DB-backed lookup that enforces `is_active` and `expires_at`; require `apiKeySecret` from env with fail-fast startup.
3. Issue keys through an admin-gated endpoint with scoped permissions and rotation/revocation.
4. Remove the query-string `api_key` acceptance from `rateLimiter.ts` `extractApiKey`.

**Acceptance Criteria:**
1. An expired, revoked, or unknown key fails with 401 even if well-formed.
2. A key's permissions/scope are enforced per request, not the hardcoded `read:queries` stub.
3. Keys are stored only as salted hashes; plaintext is returned once at issuance.
4. Startup fails without `API_KEY_SECRET`.
5. `?api_key=` in a request URL is ignored by the limiter and auth.

**Testing:** Issuance/rotation/revocation lifecycle tests; scope-enforcement tests; expired-key tests; hash-at-rest assertion (no plaintext in DB).

## Workstream 3 — Global auth enforcement on the API router

**Objective:** No protected route may be reachable without authentication.

**Problem:** `index.ts` mounts `/data`, `/privacy`, `/privacy/budget`, `/ipfs`, `/hsm`, `/mpc`, `/training`, `/privacy/noise`, `/zkp`, `/risk-assessment`, `/compliance-automation`, and `/sandbox` with no `stellarAuth.authenticate` — only rate limiting (and only some of that). `/analytics` and `/query` are rate-limited but not authenticated. Only `/auth` and `/admin` have any auth story.

**Scope:** `backend/src/index.ts` router wiring; all sub-routers; explicit public allowlist.

**Implementation:**
1. Apply `stellarAuth.authenticate` as middleware on `apiRouter` so all sub-routers inherit it.
2. Define an explicit public allowlist (`/health`, `/api/v1/auth/register`, `/api/v1/auth/login`, Swagger docs) and opt those out deliberately.
3. Keep `/api/v1/admin` on `adminAuth`; keep the HSM router's own lockdown from W4.
4. Remove the `dev` no-op fallbacks (`if (enhancedRateLimiter) ... else next()`) so auth/rate-limit absence is a startup error, not a silent pass-through.

**Acceptance Criteria:**
1. Unauthenticated requests to every listed router return 401.
2. Authenticated requests succeed; the public allowlist works.
3. No router is mounted without an explicit auth decision (code comment + test).
4. `NODE_ENV=production` with a missing middleware dependency fails startup.

**Testing:** Integration tests per router (401 without token, 200 with); allowlist tests; a "no unauth router" lint/test that scans `index.ts` mounts.

## Workstream 4 — Lock down HSM, key-management, and admin endpoints

**Objective:** Master-key rotation, kill-switch, emergency shutdown, and audit export must be admin-only.

**Problem:** `routes/hsm.ts` has zero auth: `/keys/generate` returns plaintext data keys, `/keys/decrypt` decrypts any submitted wrapped key, `/master-key/rotate` rotates the master key (potential total data-loss), `/kill-switch/activate|deactivate` and `/emergency/shutdown` toggle production controls, and `/audit*` + `/master-keys` expose audit logs and key inventory. `extractUserContext` trusts spoofable `x-user-id`/`x-session-id` headers for audit attribution. `admin.ts` `adminAuth` gates only the two metrics/config routes; the created `adminRateLimiter` is never mounted.

**Scope:** `routes/hsm.ts` (all endpoints), `routes/admin.ts`, `gateway/PrivacyApiGateway.ts` policy CRUD, `index.ts` admin limiter wiring.

**Implementation:**
1. Require `adminAuth` (+ `requirePermission("admin:key-management")` for key ops, `admin:kill-switch` for kill switch/emergency) on every HSM route.
2. Derive user context from the authenticated session only; reject spoofable headers.
3. Admin-gate and validate gateway policy CRUD (`POST/PUT/DELETE /gateway/policies`).
4. Mount `adminRateLimiter` on `/api/v1/admin` (it is created and registered for monitoring but never applied).

**Acceptance Criteria:**
1. Unauthenticated calls to every HSM route return 401; non-admin authenticated calls return 403.
2. `/master-key/rotate` and kill-switch endpoints require the admin permission and are additionally rate-limited.
3. Audit records for HSM actions show the authenticated user id, never a spoofed header.
4. Policy CRUD is admin-only and body-validated (see input-validation epic).
5. `/api/v1/admin` has a working, mounted rate limiter.

**Testing:** Per-endpoint auth matrix tests (anon → 401, user → 403, admin → 200); spoofed-header tests; kill-switch authorization tests.

## Workstream 5 — Token lifecycle integrity: revocation-first cache, sessions, and brute-force protection

**Objective:** Revocation must take effect immediately, sessions must be revocable, and credential abuse must be rate-limited.

**Problem:** `stellarAuth.ts` caches successful JWT auth for up to 1 hour keyed by token hash and only checks the Redis revocation set on cache miss — a revoked token keeps working for up to an hour (logout is ineffective). `/auth/login` has no per-account failure lockout or exponential backoff; `/auth/register` enumerates users via 409. `requirePermission` trusts the permissions embedded in the token, so there is no re-validation against current state.

**Scope:** `stellarAuth.ts` cache/revocation, `routes/auth.ts` login/register, `rateLimiter.ts`.

**Implementation:**
1. Check revocation **before** the cache; when a token is revoked, purge its cache entry.
2. Add per-account login throttling (Redis-backed) with exponential backoff and lockout; keep the bcrypt compare path constant-time and uniform.
3. Add an authenticated session registry (sessionId → user, revocable) so logout/compromise can invalidate all of a user's tokens.
4. Re-validate permission-changing state (e.g., role revocation) on a short TTL rather than trusting the token's embedded `permissions` forever.

**Acceptance Criteria:**
1. A token revoked via `/auth/logout` is rejected immediately, including within the previous 1-hour cache window.
2. N failed logins trigger lockout/backoff; lockout state is per-account and Redis-shared across instances.
3. Session revocation invalidates all outstanding tokens for the session.
4. `requirePermission` reflects permission changes within a bounded window (≤ 60s).
5. No token survives its `exp`.

**Testing:** Revocation-timing tests (revoke then immediately use token); cache-purge tests; brute-force lockout tests; session-invalidation tests; permission-change propagation tests.

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. `npm run build`, `npm run type-check`, and `npm run lint` pass with the non-blocking fallbacks removed (see the formal-verification epic's CI-gate workstream); these must be genuinely blocking.
2. `npm test` green, including the auth matrix, revocation, and lockout suites; `jest --forceExit` used as today.
3. No new route is added without an explicit auth decision in code and a corresponding integration test.
4. CI (`.github/workflows/ci.yml` `backend` job) fails on any lint/type/test failure.
5. Cross-epic gates: secrets validation comes from the secrets epic; audit records produced here are consumed by the audit-logging epic; rate-limit integration with auth tiers comes from the rate-limiting epic.
