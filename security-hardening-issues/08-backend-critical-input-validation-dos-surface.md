# (Critical) Input Validation, Sanitization & DoS Surface: ReDoS, IP Trust, and Unbounded Work

**Epic · Backend · Backend 3 of 5**

## Epic Summary

Requests are trusted by default: the policy engine compiles user-supplied regexes without a timeout (ReDoS), the enhanced rate limiter accepts spoofable `X-Forwarded-For` headers and matches User-Agents against IP whitelists, several endpoints parse and echo request bodies unsafely (a `JSON.parse` inside the audit middleware can crash a response), and multiple services do unbounded work per request (full-file audit queries, whole-index scans, unbounded caches). These workstreams are coupled: IP trust (W3) must be fixed before rate limiting (backend epic 4) can be correct; the ReDoS fix (W2) depends on policy CRUD being authenticated (authn epic W4); the validation framework (W1) is the gate that makes sanitization tractable; and bounding work (W4/W5) only holds once validation rejects oversized inputs.

## Affected Components

`backend/src/gateway/PrivacyPolicyEngine.ts`, `backend/src/gateway/PrivacyApiGateway.ts`, `backend/src/middleware/enhancedRateLimiter.ts`, `backend/src/middleware/rateLimiter.ts`, `backend/src/utils/audit.ts`, `backend/src/services/auditService.ts`, `backend/src/services/schema.ts` / `resolvers.ts` (query engine), `backend/src/routes/encrypted-upload.ts`, `backend/src/services/uploadManager.ts`

---

## Workstream 1 — Global request-validation framework

**Objective:** Every endpoint must validate its input shape, types, sizes, and unknown fields before processing.

**Problem:** Validation is ad hoc: some routes use `express-validator` (`privacy-budget.ts` consume, `hsm.ts`), most validate nothing (`routes/analytics.ts`, `routes/data.ts`, gateway policy CRUD, `encrypted-upload.ts` only checks `notEmpty`), and the global body limit is a single `express.json({ limit: "10mb" })` with no per-route limits. `utils/audit.ts` `auditMiddleware` runs `JSON.parse(body)` on any string body inside the overridden `res.send` — a non-JSON response body throws inside the response path and can crash the request.

**Scope:** A shared schema layer (the repo already depends on `joi` and `express-validator`; `shared/src/validation/` exists); every route; the audit middleware.

**Implementation:**
1. Build route schemas (Zod/Joi) for every endpoint: required/optional fields, types, length/range bounds, `stripUnknown: true` or explicit rejection, and per-route body-size limits below the global cap.
2. Apply `validateRequest` (exists at `middleware/validation.ts`) consistently; remove ad hoc `validationResult` duplication.
3. Fix `auditMiddleware`: parse JSON defensively, never throw in the response path, and never persist request/response bodies (see audit-logging epic).
4. Add validation for file content (CSV/JSON parse depth, row count, per-row size) in `encrypted-upload.ts` so a malicious "schema validation" payload cannot exhaust memory.

**Acceptance Criteria:**
1. Every route has a schema; a request with unknown fields, wrong types, or over-size bodies returns 400 with a structured error.
2. Per-route body limits are enforced below the 10mb global cap for upload/schema-validation endpoints.
3. `auditMiddleware` never throws or crashes a response, and stops logging full bodies.
4. Malformed CSV/JSON upload content is rejected with a 400, not a 500.

**Testing:** Per-route validation matrices; oversized-body tests; malformed-content tests; audit-middleware crash regression tests; a schema-coverage lint that fails when a route lacks a schema.

## Workstream 2 — ReDoS-proof policy engine

**Objective:** User-influenced regexes must never block the event loop.

**Problem:** `gateway/PrivacyPolicyEngine.ts` `matchAttribute` builds a `RegExp` directly from `rule.value` (no sanitization, no timeout, no length cap). Combined with the (currently unauthenticated) policy CRUD from the authn epic, an attacker injects a catastrophic pattern like `(a+)+$` and stalls the Node event loop for every matching request.

**Scope:** `PrivacyPolicyEngine.ts` regex paths, policy validation (`gateway/policyValidation.ts`), policy CRUD.

**Implementation:**
1. Replace `RegExp` evaluation with a linear-time engine (`re2`) or wrap every `.test()`/`.exec()` in a worker/timeout (default 100ms cap), with a documented fallback warning.
2. Validate patterns at policy creation: length cap (e.g., 200 chars), reject known-catastrophic constructs, allowlist pattern sources where possible.
3. Cache compiled patterns safely (per-pattern compile once, bounded cache — ties to the unbounded-work workstream).

**Acceptance Criteria:**
1. `(a+)+$`-class patterns timeout or are rejected at creation and never block the loop (measured test).
2. Valid patterns still match correctly after the change.
3. Policy bodies are validated (schema + regex policy) before persistence.
4. No unbounded pattern cache.

**Testing:** Catastrophic-pattern benchmark tests (event-loop latency bounded); pattern-validation tests; regression tests for legitimate regex use cases.

## Workstream 3 — Proxy/IP trust and correct network identity

**Objective:** The server must use a trusted, non-spoofable client identity.

**Problem:** `index.ts` never sets `app.set("trust proxy", ...)`, yet `rateLimiter.ts` `ipKeyGenerator` trusts `x-forwarded-for` (first value), `x-real-ip`, `cf-connecting-ip`, and `x-client-ip` from the client. Any attacker rotates the header to evade limits or — worse — impersonates another user's IP to lock them out. `enhancedRateLimiter.ts` `isWhitelisted` also matches the **User-Agent string** against whitelist entries (sandbox whitelist contains `"localhost"`), so `User-Agent: localhost` bypasses sandbox limits. `isIpInRange` does octet-split prefix matching (`/17` matches `10.0.128.0/17` incorrectly) — a whitelist/CIDR bypass.

**Scope:** `index.ts` proxy config, `rateLimiter.ts` `ipKeyGenerator`, `enhancedRateLimiter.ts` `isWhitelisted`/`isIpInRange`, deployment docs (nginx/ALB header stripping).

**Implementation:**
1. Set `app.set("trust proxy", <explicit hop count or provider>)` and document the reverse-proxy header-stripping requirement; ignore `x-forwarded-for` when not behind the trusted proxy.
2. Remove User-Agent from whitelist matching; whitelist IPs only.
3. Replace `isIpInRange` with correct bitwise CIDR matching (BigInt), with boundary tests (`/0`, `/17`, `/24`, `/32`).
4. Normalize IPv4-mapped addresses and reject malformed IPs rather than falling back to `"unknown"`.

**Acceptance Criteria:**
1. With `trust proxy` unset, spoofed `x-forwarded-for` does not change the limiter key.
2. Rotating `x-forwarded-for` cannot evade limits or impersonate another IP.
3. `User-Agent: localhost` no longer bypasses sandbox whitelists.
4. CIDR matching is correct at all boundary prefixes (property-tested against a reference implementation).
5. Malformed IPs fail closed (limited, not unlimited).

**Testing:** Header-spoofing tests; CIDR property tests (50+ random combos vs reference); whitelist-bypass regression tests; reverse-proxy integration docs test.

## Workstream 4 — Bound all unbounded work per request

**Objective:** No request may trigger work proportional to total stored state.

**Problem:** `auditService.query` reads and parses the entire `logs/audit.log` file per query; `schema_enforcer`-style index scans have backend analogues (e.g., `get_validation_log`-style full scans); `zkpService.proofCache` grows without bound; `differentialPrivacy.getPrivacyMetrics` filters the whole query history; `uploadManager` retains all uploads in memory until a 24h sweep. Under adversarial load each becomes a DoS amplifier.

**Scope:** `auditService.query/getMetrics`, `zkpService.proofCache`, `differentialPrivacy` history, `uploadManager` retention, pagination on list endpoints.

**Implementation:**
1. Move audit storage to append-only files with an index (or Postgres) and query by index/pagination; never full-file scans (see audit-logging epic for the durable-sink work).
2. Bound `proofCache` with LRU + max size and a Prometheus gauge; bound DP history with a cap.
3. Enforce upload retention bounds and per-user upload caps; fail fast beyond limits.
4. Enforce pagination caps on every list endpoint (default + max limit).

**Acceptance Criteria:**
1. An audit query over 1M records returns bounded results in bounded time (benchmarked).
2. `proofCache` size is capped; the gauge reflects eviction under load.
3. A user cannot create unbounded uploads or history rows.
4. No endpoint returns more than the pagination cap.
5. Memory usage is bounded under sustained adversarial traffic (load test with memory assertions).

**Testing:** Benchmark tests; cache-cap load tests; pagination-cap tests; memory-bounded load runs via `npm run test:load:heavy`.

## Workstream 5 — Upload hardening: real chunk validation and content sanitization

**Objective:** The upload pipeline must validate chunks, bound resources, and never trust client-declared metadata.

**Problem:** `uploadManager.processChunk` trusts `chunkData.chunkIndex`/`totalChunks`/`fileSize` and increments progress from `chunkData.chunkData.length` with no bounds checks (an attacker declares `fileSize=1` and uploads a 1MB chunk; or declares 10^9 chunks); chunks are never stored (simulate path). `routes/encrypted-upload.ts` accepts `content` in the body with no size/type enforcement beyond `notEmpty`. `fileName` is echoed into logs and Pinata metadata without sanitization.

**Scope:** `uploadManager.ts`, `routes/encrypted-upload.ts`, `routes/data.ts` upload paths, `services/ipfsService.ts` metadata.

**Implementation:**
1. Validate chunk bounds: `chunkIndex < totalChunks`, `fileSize` within configured min/max, `chunkData.length <= CHUNK_SIZE`, total received bytes never exceed `fileSize` (reject on mismatch).
2. Persist chunks (from the consistency epic's W3) with integrity hashes; reassemble only after all chunks verified.
3. Sanitize `fileName` (basename, charset, length) before logging and before sending to Pinata metadata.
4. Enforce upload concurrency caps per user (ties to rate limiting epic).

**Acceptance Criteria:**
1. Out-of-range chunk indexes, inconsistent sizes, and oversize chunks are rejected with typed errors.
2. A "completed" upload equals the original bytes (integrity check).
3. `fileName` with path traversal/control characters is sanitized or rejected; logs and Pinata metadata contain only sanitized names.
4. Per-user concurrent upload limits are enforced.

**Testing:** Chunk-boundary fuzz tests; reassembly integrity tests; filename-sanitization tests; per-user concurrency cap tests.

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. `npm run build`, `npm run type-check`, `npm run lint` pass and are blocking.
2. `npm test` green, including validation matrices, ReDoS benchmarks, CIDR property tests, and upload fuzz tests.
3. A route-schema-coverage lint fails the build when a route lacks validation.
4. CI's backend job is blocking (`.github/workflows/ci.yml`) with no `continue-on-error`.
5. Cross-epic gates: policy CRUD validation depends on the authn epic's admin gating; correct IP identity is a precondition for the rate-limiting epic; upload persistence comes from the consistency epic.
