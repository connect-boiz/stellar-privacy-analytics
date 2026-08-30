# (Critical) Rate Limiting, DoS Protection & Security Audit Logging: Public Bypass Keys and Silent Failures

**Epic · Backend · Backend 4 of 5**

## Epic Summary

The rate-limiting layer ships with a hardcoded emergency bypass key (`"emergency-bypass-2024"`) usable via a query parameter, trusts spoofable client headers, keeps its advanced state in per-process memory (multiplying effective limits by instance count), and creates an admin limiter it never mounts. Meanwhile the audit layer writes plaintext logs with a hardcoded signing key, captures full request/response bodies (including passwords) into files, and lets anyone query/export them through the unauthenticated HSM routes. These workstreams are coupled: bypass removal (W1) and distributed state (W2) both need the IP-trust fix from the input-validation epic; tier-aware limits (W4) depend on the authn epic's identity; and the audit workstreams (W5) must ride the same authz gates so logs of blocks/bypasses are themselves trustworthy and protected.

## Affected Components

`backend/src/middleware/rateLimiter.ts`, `backend/src/middleware/enhancedRateLimiter.ts`, `backend/src/index.ts`, `backend/src/routes/auth.ts`, `backend/src/gateway/PrivacyApiGateway.ts`, `backend/src/services/auditService.ts`, `backend/src/utils/audit.ts`, `backend/src/routes/hsm.ts`, `backend/src/monitoring/rateLimitMonitor.ts`

---

## Workstream 1 — Remove the public emergency bypass

**Objective:** No documented, source-known value may disable rate limiting.

**Problem:** `rateLimiter.ts` defaults `emergencyBypassKey` to `"emergency-bypass-2024"` and `checkEmergencyBypass` accepts it via the `x-emergency-bypass` header **or** the `emergency_bypass` query parameter (leaking the key into logs, referrers, and history). Every source-code reader — including attackers — knows the key; every endpoint's limits are disabled on demand.

**Scope:** `rateLimiter.ts` `checkEmergencyBypass`/constructor, `enhancedRateLimiter.ts` inheritance, `index.ts` wiring.

**Implementation:**
1. Remove the hardcoded fallback; fail startup when `RATE_LIMIT_EMERGENCY_BYPASS_KEY` is unset or equals a known default.
2. Remove the query-parameter path; only a configured header (or an authenticated internal route) may carry the key.
3. Audit-log every bypass use (who/what/when/route) and emit a Prometheus counter; require the key to be rotated on any suspected exposure.
4. Require at least two independent approval signals for a production bypass (e.g., key + authenticated admin), or remove the bypass entirely in favor of a config-reload path.

**Acceptance Criteria:**
1. `?emergency_bypass=emergency-bypass-2024` is ignored; the known default never works.
2. Startup fails without an explicitly configured, non-default key.
3. Every bypass use is logged and metered.
4. The bypass cannot be triggered through a query string, referrer, or log leakage path.

**Testing:** Bypass-negative tests (default key rejected, query param rejected); bypass-audit tests; startup-validation tests; rotation tests.

## Workstream 2 — Distributed rate-limit state (single enforcement across instances)

**Objective:** Effective limits must be N, not N × instances.

**Problem:** `enhancedRateLimiter.ts` keeps collision, burst, and adaptive state in per-process Maps; `PrivacyApiGateway.ts` uses `RateLimiterMemory` (per the prior audit) instead of the Redis-backed limiter; the standard limiter's Redis keys are correct but the per-instance maps double-count. With `docker-compose.optimized.yml` multi-instance deployments, burst limits and adaptive limits multiply by instance count.

**Scope:** `enhancedRateLimiter.ts` maps, `gateway/PrivacyApiGateway.ts` limiter selection, `rateLimiter.ts` key hygiene.

**Implementation:**
1. Move collision/burst/adaptive state into Redis (Lua-scripted increments with TTLs) so all instances share one decision.
2. Replace `RateLimiterMemory` in the gateway with `RateLimiterRedis` on the shared client, with a documented memory fallback for single-instance dev only.
3. Add a `RATE_LIMIT_BACKEND` config flag (`redis` | `memory`) and a Prometheus gauge exposing the active backend; log a warning when falling back.
4. Enforce that production startup fails without Redis when `RATE_LIMIT_BACKEND=redis`.

**Acceptance Criteria:**
1. Two instances sharing Redis enforce a single burst/collision/adaptive limit (integration test).
2. The gateway limiter is Redis-backed in production; memory mode is dev-only and warned.
3. `RATE_LIMIT_BACKEND` is exported as a gauge; fallback is visible in logs.
4. No per-instance state remains in the limit-decision path.

**Testing:** Two-instance integration tests; backend-gauge tests; memory-fallback warning tests; Lua-atomicity tests under concurrent load.

## Workstream 3 — Mount the missing limiters and fail closed, never silently skip

**Objective:** Every route group must have a working limiter, and limiter outages must not open the floodgates.

**Problem:** `index.ts` creates and registers `adminRateLimiter` but never mounts it on `/api/v1/admin`; the global `/api/v1` enhanced limiter is applied inside `if (enhancedRateLimiter) { ... } next();` — if initialization fails or Redis is down, every request silently passes through. `/sandbox` gets 2000 req/min by default and `/auth` gets only the global limiter (no per-account login protection — see the authn epic's W5).

**Scope:** `index.ts` middleware wiring, `createAdminRateLimiter` usage, route-group limits, startup validation.

**Implementation:**
1. Mount `adminRateLimiter` on `/api/v1/admin` with admin-tier limits.
2. Replace silent `if (x) ... next()` pass-throughs with fail-closed behavior: when the limiter or Redis is unhealthy, reject with 503 (consistent with `applyRateLimit`'s production fail-closed path) or refuse startup in production.
3. Add per-route-group limit manifests (auth, analytics, query, data, upload, sandbox) with explicit values and tests, replacing scattered inline config.
4. Keep the sandbox whitelist localhost-only and non-spoofable (see input-validation epic's IP-trust fix).

**Acceptance Criteria:**
1. `/api/v1/admin` is rate-limited (429 beyond admin-tier limits).
2. Redis outage in production yields 503 on rate-limited routes, never unlimited pass-through.
3. Every route group has a documented limit with a test proving enforcement.
4. Sandbox limits cannot be bypassed via User-Agent or spoofed headers.

**Testing:** Admin-limiter tests; Redis-outage fail-closed tests; per-group limit tests; sandbox bypass regression tests.

## Workstream 4 — Tier-aware, account-aware limits and login brute-force protection

**Objective:** Limits must bind to the authenticated principal and protect credentials from brute force.

**Problem:** Limits are keyed by IP for anonymous traffic and by user for authenticated traffic, but the tier from the JWT (`rateLimitTier`) is honored only after authentication; `/auth/login` and `/auth/register` are anonymous with only IP limits — no per-account failure lockout, no backoff, enabling credential stuffing. The `extractApiKey` path in the rate limiter also accepts query-param API keys (see authn epic).

**Scope:** `rateLimiter.ts` key/tier logic, `routes/auth.ts` login/register, `enhancedRateLimiter.ts` tier handling.

**Implementation:**
1. Apply per-account login/register limits (Redis `INCR` on `auth:fail:email`, exponential backoff, lockout) in addition to IP limits.
2. Enforce tier limits from the authenticated principal across all route groups (basic/premium/enterprise) with explicit tier tables; reject downgrade claims from unauthenticated requests.
3. Rate-limit by organization for enterprise keys so one tenant cannot exhaust shared pools.
4. Keep bcrypt work factor (12) and add timing-uniform responses for unknown-email vs wrong-password.

**Acceptance Criteria:**
1. N failed logins for one account trigger lockout/backoff shared across instances.
2. Authenticated tier limits are enforced end-to-end (JWT tier → limiter config → 429 at tier limit).
3. Enterprise orgs have per-org pools; a single key cannot consume another org's budget.
4. Login responses are timing-uniform; account enumeration via 409 is mitigated (generic error).

**Testing:** Brute-force lockout tests; tier-enforcement matrix; per-org pool tests; timing tests.

## Workstream 5 — Trustworthy security audit logging (integrity, protection, no secrets)

**Objective:** Audit logs must be tamper-evident, protected from unauthenticated reads, and free of secrets.

**Problem:** `auditService.ts` signs records with `AUDIT_SIGNATURE_KEY || "default-key"` (source-known), writes plaintext JSON to `logs/audit.log` (no rotation beyond a manual cleanup, no shipping to a durable sink), and `signRecord` excludes `details`/response fields — so logged bodies can be tampered without breaking the signature. `utils/audit.ts` `auditMiddleware` captures full `requestBody`/`responseBody` (passwords, tokens, PII) into the log file. `routes/hsm.ts` exposes `/audit`, `/audit/export`, and `/audit/metrics` **unauthenticated** (see authn epic W4), and `extractUserContext` accepts spoofable `x-user-id` headers, so the audit trail can be read and poisoned by anyone.

**Scope:** `auditService.ts` (signing, storage, query), `utils/audit.ts` (body capture), `routes/hsm.ts` audit endpoints, `rateLimitMonitor.ts` alerting on security events.

**Implementation:**
1. Sign every record over **all** fields (including details) with a managed key from the secrets epic; reject/flag records whose signature does not verify (already possible via `verifyIntegrity` — wire it into monitoring).
2. Stop capturing request/response bodies; log hashes, sizes, and structured metadata instead; sanitize actor fields from authenticated sessions only.
3. Ship audit records to a durable sink (Postgres table or external SIEM) with WAL-style append-only semantics; retain the file only as a buffer; add rotation and retention enforcement (90 days per `.env.example`).
4. Protect audit endpoints with `adminAuth`; remove header-based actor identity.
5. Add alerting on `security_violation` and rate-limit bypass events (wire `rateLimitMonitor` to emit).

**Acceptance Criteria:**
1. Tampering with any field of a logged record (including details) breaks `verifyIntegrity`.
2. No audit record contains raw passwords, tokens, or full request/response bodies.
3. Audit endpoints return 401/403 without admin auth; actor identity comes from the session.
4. Records are durably stored (survive process restart) and retained per policy with rotation.
5. Bypass/block/security events produce alerts (metric + log) consumed by monitoring.

**Testing:** Tamper-detection tests; no-secrets-in-logs tests (regex scan of generated logs); authz tests on audit endpoints; durability/rotation tests; alert-emission tests.

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. `npm run build`, `npm run type-check`, `npm run lint` pass and are blocking.
2. `npm test` green, including two-instance, fail-closed, lockout, and tamper-detection suites.
3. `npm run test:load:moderate` passes in CI as a smoke gate with memory assertions (from the input-validation epic).
4. CI's backend job is blocking; no `continue-on-error` in `.github/workflows/ci.yml`.
5. Cross-epic gates: identity for tier limits comes from the authn epic; IP trust from the input-validation epic; audit signing key from the secrets epic; and the audit schema must index the contract-event correlation from the consistency epic.
