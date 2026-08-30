# 15 Hard & Critical Issues — Stellar Privacy Analytics (Part 2)

---

## Issue #16: Docker Compose Hardcoded Credentials Across All Infrastructure Services

**Severity:** Critical  
**Area:** Infrastructure — Secrets Management  
**File:** `docker-compose.yml:12,15,149`, `docker-compose.optimized.yml:15,157`

### Description
Both Docker Compose files embed plaintext credentials for critical infrastructure components:

- **PostgreSQL:** `POSTGRES_PASSWORD: password` (docker-compose.yml line 15) — the literal string `"password"` is used when `POSTGRES_PASSWORD` env var is unset
- **Grafana:** `GF_SECURITY_ADMIN_PASSWORD: admin` (docker-compose.yml line 149) — administrative dashboard accessible with `admin`/`admin`
- **Redis:** Neither compose file sets `REDIS_PASSWORD`, yet `redis.conf` (line 47) contains `requirepass ${REDIS_PASSWORD}`. Redis starts with **no password** because the env-var substitution produces an empty-string literal, which Redis interprets as "no password required"
- **Replication:** `POSTGRES_REPLICATION_PASSWORD` defaults to `replicator_password` (docker-compose.optimized.yml line 18)

Additionally, PostgreSQL is exposed on `0.0.0.0:5432` (ports: `"5432:5432"`) without SSL/TLS, and Redis is exposed on `0.0.0.0:6379` without TLS. Any host on the network can connect to the database and cache without credentials.

### Acceptance Criteria
1. Replace all hardcoded passwords with `${VAR:?error}` syntax that fails fast when unset (e.g., `${POSTGRES_PASSWORD:?required}`)
2. Add `.env.example` with all required variables documented and placeholder values clearly marked
3. Configure Redis with a strong password set via env var; validate the password is non-empty at container startup
4. Change Grafana admin password to use `${GRAFANA_ADMIN_PASSWORD:?required}`
5. Bind PostgreSQL and Redis only to `127.0.0.1` or the internal Docker network — remove `ports:` exposure or bind to `127.0.0.1:5432:5432`
6. Add TLS configuration for PostgreSQL connections (set `PGSSLMODE=require` and mount certificates)
7. Add a pre-flight check script that validates no default passwords are in use before starting services

---

## Issue #17: APIKeyManager Emits Full Admin API Key to stdout/Console Logs

**Severity:** Critical  
**Area:** Backend — Secret Leakage  
**File:** `backend/src/gateway/APIKeyManager.ts:306-310`

### Description
In `initializeDefaultKeys()`, when `NODE_ENV === "development"`, the APIKeyManager generates an admin key with all permissions and emits the **full plaintext key** to the console:

```typescript
console.warn(`[DEV] Default admin API key: ${apiKey}`);
```

This write goes to stdout, which is captured by:
- Docker log drivers (json-file, fluentd, CloudWatch, etc.)
- CI/CD pipeline logs
- Container orchestration log aggregators (ELK, Loki, Datadog)
- Terminal scrollback buffers on developer machines
- Screen-sharing or recording sessions during development

Anyone with access to any of these log streams gains full administrative API access (all permissions: `["admin", "read", "write", "delete"]`) with no IP/origin/service restrictions and a 1,000,000 requests/day rate limit. This key has no expiration.

### Acceptance Criteria
1. Remove the `console.warn` line entirely — never log full secrets
2. If a development default key must exist, hash it and log only the key prefix (first 8 chars) so developers can identify which key is active
3. Add a startup check in production that panics if `NODE_ENV === "production"` and the default admin key `"admin_key_default"` exists (it should have been removed or rotated)
4. Add a `createdAt` check: if the default key is older than 24 hours, emit a warning that it should be rotated
5. Write a test that proves no secret material (keyHash, raw key) appears in log output
6. Document the development key lifecycle in the security runbook

---

## Issue #18: ComplianceAutomationService Uses Math.random() for Compliance Validation — All Regulatory Scans Are Meaningless

**Severity:** Critical  
**Area:** Backend — Regulatory Compliance  
**File:** `backend/src/services/complianceAutomationService.ts:289-301`

### Description
The `performRuleCheck` method — the core engine behind all GDPR, CCPA, and HIPAA compliance scans — is a stub that returns random results:

```typescript
private async performRuleCheck(rule: ComplianceRule): Promise<{
  passed: boolean; message: string; affectedResources: string[];
}> {
  // This is a simulation - in production, implement actual checks
  const passed = Math.random() > 0.3; // 70% pass rate for demo
  return {
    passed,
    message: passed ? `${rule.name} check passed` : `${rule.name} check failed: ${rule.description}`,
    affectedResources: passed ? [] : ["resource_1", "resource_2"],
  };
}
```

Every compliance scan report — GDPR data minimization, CCPA opt-out verification, HIPAA technical safeguards — is based on random coin flips, not actual system state. This means:

- **False negatives (30%):** Real compliance violations are hidden 30% of the time per rule. With 14 rules across 3 regulations, the probability that at least one genuine violation is missed is virtually certain
- **False positives (70%):** The system reports violations that don't exist, desensitizing operators to real alerts
- **Audit trail contamination:** All `AuditEntry` records are fabricated and would not stand up to regulatory scrutiny
- **Scheduled scans (`startMonitoring`):** Cron-based automated scans perpetuate this fraud on a schedule

Organizations relying on this for GDPR/CCPA/HIPAA compliance attestation are unknowingly non-compliant.

### Acceptance Criteria
1. Replace `Math.random()` stubs with actual compliance checks that inspect real system state (database schemas, encryption config, access control policies, audit log completeness)
2. Implement at minimum the following real checks:
   - `checkDataMinimization`: query the database schema for non-essential PII columns
   - `checkConsentManagement`: verify consent records exist and are within expiry
   - `checkBreachNotification`: verify the alert pipeline is configured and tested
   - `checkTechnicalSafeguards`: verify encryption is enabled in the database connection config
3. If a rule cannot be automatically verified, return status `"unknown"` with a clear explanation — never fabricate a pass/fail
4. Write integration tests that prove each `checkFunction` returns results based on actual system state, not randomness
5. Add a startup warning if any rule check function resolves to the default stub
6. Remove the `affectedResources: ["resource_1", "resource_2"]` placeholder — resources must be real identifiers

---

## Issue #19: KillSwitchService Rolling Metrics Window Enables Threshold Evasion by Timing Attacks

**Severity:** High  
**Area:** Backend — Security Operations  
**File:** `backend/src/services/killSwitchService.ts:144-152`

### Description
The security metrics counters (`failedAuthentications`, `suspiciousRequests`, `keyAccessAnomalies`, `systemErrors`) are reset to zero every `metricsWindow` minutes (default: 5 minutes) via `setInterval`:

```typescript
this.metricsResetTimer = setInterval(() => {
  this.resetMetrics();
}, this.securityMetrics.timeWindow * 60 * 1000);
```

An attacker who understands the window duration can:
1. **Distribute attacks across windows:** Send `maxFailedAuth - 1` failed authentications near the end of each 5-minute window. The counter resets, and they continue in the next window — never triggering the kill switch despite sustained attack volume
2. **Exploit the reset race:** Submit a burst just after a reset. The system has up to 5 minutes before the next evaluation, during which the attack goes unmitigated
3. **Combined threshold evasion:** By distributing across all four metric types (auth, suspicious requests, key anomalies, system errors), a sophisticated attacker can probe the system indefinitely without triggering any single threshold

The `checkThresholds` method only evaluates metrics after an event fires — if an attacker's activity never crosses a threshold within a single window, no alert is ever raised.

### Acceptance Criteria
1. Replace the periodic reset with a sliding window approach (e.g., track timestamps of each event and count only events within the last N minutes)
2. Add a half-window overlap: when the window resets, persist the last window's counts for at least one additional window as a "cool-down" that decays exponentially
3. Add a cumulative counter that tracks total events across all windows; if the cumulative total exceeds `threshold × 3`, trigger the kill switch regardless of window boundaries
4. Write a test that simulates `maxFailedAuth - 1` events in window 1, reset, then `maxFailedAuth - 1` in window 2, and proves the kill switch activates (cumulative threshold)
5. Write a test proving that genuine single-window threshold breaches still activate the kill switch within the window
6. Document the evasion-resistant windowing algorithm in the security operations runbook

---

## Issue #20: Redis Service Discovery Exposes Unauthenticated Redis to the Network

**Severity:** Critical  
**Area:** Infrastructure — Network Security  
**File:** `redis/redis.conf:4-6,50`

### Description
The service-discovery Redis configuration (`redis/redis.conf`, mounted in `docker-compose.yml` line 38) explicitly disables all security:

```conf
bind 0.0.0.0
protected-mode no
# requirepass your-redis-password   ← commented out
```

This means:
- Redis accepts connections from **any IP address** (`bind 0.0.0.0`)
- Protected mode is **disabled**, so Redis won't reject non-localhost connections even without a password
- No authentication is required — any client can execute arbitrary commands

The Redis instance stores the **entire service registry**: all service instances, their health status, metadata, and routing information. An attacker who connects can:
- **Read the service topology:** Discover all internal services, hosts, and ports for lateral movement
- **Poison the registry:** Inject fake service instances to redirect traffic (man-in-the-middle)
- **Delete services:** `DEL service:*` removes all service registrations, causing cascading discovery failures
- **Execute Lua scripts:** `EVAL` can run arbitrary server-side scripts
- **Configure replication:** `SLAVEOF` can exfiltrate all data to an attacker-controlled Redis instance

### Acceptance Criteria
1. Set `protected-mode yes` and configure `bind` to only the internal Docker network interface (not `0.0.0.0`)
2. Uncomment and set `requirepass` with a strong, randomly generated password passed via environment variable
3. Add a startup health check that verifies Redis requires authentication (attempt `PING` without AUTH and assert failure)
4. Configure Redis TLS if the Redis image supports it; if not, ensure Redis is only accessible via internal Docker network, not host port mapping
5. Remove the host port mapping `"6379:6379"` from docker-compose in production configurations — Redis should only be reachable within the Docker network
6. Add Redis authentication configuration to the backend's `REDIS_URL` (e.g., `redis://:password@redis:6379`)

---

## Issue #21: Soroban ZkVerificationContract Uses SHA256 Hash Comparison Instead of Real ZK Proof Verification

**Severity:** Critical  
**Area:** Smart Contract — Zero-Knowledge Proofs  
**File:** `src/lib.rs:28-53`

### Description
The on-chain `ZkVerificationContract::verify_proof` method performs **no actual zero-knowledge proof verification**. Instead, it computes a SHA256 hash of the `(circuit_id, public_inputs)` tuple and compares it byte-for-byte against the supplied `proof`:

```rust
let expected_proof_data = (circuit_id.clone(), public_inputs.clone());
let expected_proof = env.crypto().sha256(&expected_proof_data.to_xdr(&env));

if expected_proof.to_array() != proof.to_array() {
    return Err(Error::InvalidProof);
}
```

This means:
- **Anyone can forge a "proof":** An attacker simply computes `SHA256((circuit_id, public_inputs))` and submits it as the proof — no knowledge of a witness/secret is required
- **No witness privacy:** The "verifier" learns nothing about whether the prover knows a valid witness because no witness is involved at all
- **Replay attack prevention is the only actual security:** The `AlreadyVerified` check prevents re-submission, but a new proof for a different circuit or different inputs passes trivially
- **Misleading name:** The contract is named `ZkVerificationContract` and uses ZK terminology (`circuit_id`, `public_inputs`, `proof`, `verify_proof`), but implements zero of the cryptographic properties of ZK proofs

The contract is used to gate access to privacy-sensitive operations on Stellar — any access control built on this contract is trivially bypassable.

### Acceptance Criteria
1. Integrate a real ZK proof system — either:
   - Call a Groth16/PLONK verifier via Soroban's crypto host functions (if available), or
   - Implement the verification algorithm for a specific proving system (e.g., Groth16 pairing checks using Soroban's BN254 support), or
   - Rename the contract to `HashBasedAccessContract` and document that it provides only hash-preimage verification, not ZK
2. If real ZK is deferred, the contract must return an explicit error variant `UnsupportedOperation` rather than silently accepting all "proofs"
3. Update the contract's documentation to accurately describe its security properties
4. Write a test proving that a proof generated without knowledge of a secret witness is rejected (currently it is accepted)
5. Write a test proving that a valid proof from a real ZK prover (e.g., circom + snarkjs) is accepted
6. Add a circuit registry that maps `circuit_id` to verification keys, so different circuits can have different verification parameters

---

## Issue #22: DataSovereigntyContract Instance Storage TTL Expiration Causes Silent Ownership Loss

**Severity:** High  
**Area:** Smart Contract — Data Sovereignty  
**File:** `src/data_sovereignty.rs:42-48,55-60`

### Description
The `DataSovereigntyContract` stores all ownership records and access grants in `env.storage().instance()`:

```rust
env.storage().instance().set(&owner_key, &owner);
env.storage().instance().set(&access_key, &expiration_ts);
```

On Soroban, **instance storage has a limited TTL** (Time To Live). When the TTL expires:
- All ownership records (`DataKey::Owner(cid)`) are silently deleted — no event is emitted, no error is returned
- All access grants (`DataKey::Access(cid, grantee)`) are deleted
- `check_access` returns `Err(SovereigntyError::DataNotFound)` for previously valid CIDs
- The original data owner can no longer prove ownership or manage access
- There is no mechanism to restore the lost state from persistent storage

The contract does call `extend_ttl` in `ZkVerificationContract` (the separate ZK contract at `src/lib.rs:56`), but **`DataSovereigntyContract` itself never extends its own instance TTL**. Unlike the ZK contract, the sovereignty contract has no `extend_ttl` call in any of its functions.

The `register_data`, `grant_access`, and `revoke_access` functions all write to instance storage without extending its lifetime. Over time, as ledger entries age, ownership data is guaranteed to be lost.

### Acceptance Criteria
1. Add `env.storage().instance().extend_ttl(ledger_sequence, ledger_sequence)` calls in every mutating function (`register_data`, `grant_access`, `revoke_access`)
2. Use persistent storage (`env.storage().persistent()`) for ownership records that must survive long-term, keeping only transient access grants in instance storage
3. Write a Soroban test that advances the ledger past the default TTL threshold and verifies that ownership records are still accessible
4. Write a test that proves after TTL expiry in the current implementation, `check_access` returns `DataNotFound`
5. Add a migration function that can restore ownership from persistent to instance storage if needed
6. Document the storage architecture and TTL strategy in the contract specification

---

## Issue #23: PrivacyApiGateway JWT Verification Uses HS256 with Hardcoded Fallback Secret (Second Location)

**Severity:** Critical  
**Area:** Backend — Authentication  
**File:** `backend/src/gateway/PrivacyApiGateway.ts:489-499`

### Description
The `PrivacyApiGateway.extractUserAttributes` method verifies JWTs using **exclusively HS256** with a hardcoded fallback secret, in a **separate location** from the already-identified issue in `stellarAuth.ts` (Issue #1):

```typescript
const jwtSecret = process.env.JWT_SECRET || "stellar-privacy-jwt-secret-dev-only";
const decoded = jwt.verify(token, jwtSecret, {
  algorithms: ["HS256"],
}) as { sub?: string; permissions?: string[]; email?: string; };
```

Key differences from Issue #1 that make this an independent vulnerability:

- **Location:** Issue #1 is in the authentication middleware (`stellarAuth.ts`) that gates API access. This issue is in the **gateway's attribute extraction** (`PrivacyApiGateway.ts`), which runs after the middleware and extracts user roles/permissions for ABAC policy evaluation
- **Algorithm lock-in:** Issue #1 attempts ES256 first then falls back to HS256. This code **only** accepts HS256 — there is no Ed25519 path at all
- **Impact:** Even if Issue #1 is fixed (auth middleware rejects forged JWTs), an attacker who obtains a valid JWT through another means can still forge user attributes (roles, permissions) that control what data they can access via ABAC policies
- **Silent failure:** If JWT verification fails, the catch block only logs a warning and continues — the user proceeds with empty attributes, potentially bypassing role-based restrictions

### Acceptance Criteria
1. Replace HS256-only verification with Stellar Ed25519 verification consistent with the auth middleware
2. Remove the hardcoded fallback secret — crash at startup if `JWT_SECRET` is unset
3. On JWT verification failure, do not proceed with empty attributes — return a 401 error
4. If the JWT is optional (unauthenticated users allowed), explicitly set attributes to indicate unauthenticated status rather than silently proceeding
5. Write a test proving that a forged HS256 JWT with fabricated roles/permissions does not result in elevated ABAC access
6. Write a test proving that a valid Stellar-signed JWT correctly populates user attributes

---

## Issue #24: `unhandledRejection` Handler Calls `process.exit(1)` Without Graceful Shutdown

**Severity:** High  
**Area:** Backend — Process Management  
**File:** `backend/src/index.ts:473-476`

### Description
The `unhandledRejection` handler performs an immediate hard exit:

```typescript
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
```

`process.exit(1)` terminates the Node.js event loop immediately without:
- Closing open database connections (PostgreSQL pool connections leak)
- Flushing pending writes (in-flight privacy budget updates, audit log entries)
- Completing in-progress HTTP responses (clients receive connection resets)
- Closing Redis connections (connection pool orphaned; Redis keeps connections alive until timeout)
- Running `server.close()` to stop accepting new connections gracefully
- Invoking the registered `SIGTERM`/`SIGINT` handlers which DO perform graceful shutdown

The `uncaughtException` handler at line 481 has the same problem.

In production, this means:
- **Data loss:** Any uncommitted database transactions are rolled back, but in-memory state (cache entries, rate limit counters, privacy budget accumulators) is lost
- **Client-facing errors:** In-flight API requests get TCP RST instead of proper 5xx responses, which most SDKs interpret as a network failure rather than a server error
- **Orphaned resources:** PostgreSQL connection slots remain occupied until TCP keepalive timeout (~2 hours by default); under repeated crashes, the connection pool exhausts

### Acceptance Criteria
1. Replace `process.exit(1)` with a graceful shutdown sequence that:
   - Calls `server.close()` to stop accepting new connections
   - Waits for existing connections to complete (with a configurable timeout, default 30s)
   - Closes the database connection pool
   - Closes Redis connections
   - Flushes pending log entries
   - THEN calls `process.exit(1)`
2. Set a maximum shutdown timeout (e.g., 60s) after which the process force-exits to prevent hanging indefinitely
3. In the unhandled rejection handler, log the full error stack and the promise chain for debugging
4. Consider using `process.abort()` instead of `process.exit(1)` in `uncaughtException` to generate a core dump for post-mortem analysis
5. Write an integration test that triggers an unhandled rejection and verifies:
   - No active connections remain open after shutdown
   - The server stops accepting new requests within the grace period
   - Logged output contains the error details

---

## Issue #25: PrivacyBudgetService Non-Atomic Check-Then-Consume Enables Budget Exhaustion

**Severity:** High  
**Area:** Backend — Differential Privacy  
**File:** `backend/src/services/privacyBudgetService.ts:57-88`

### Description
The `enforceBudget` and `consumeBudget` methods are independent, non-transactional calls. A typical caller pattern is:

```typescript
// Step 1: Check
const allowed = await budgetService.enforceBudget(datasetId, orgId, requiredEpsilon);
if (!allowed) throw new Error("Budget exhausted");

// Step 2: Consume (race window)
await budgetService.consumeBudget(budgetId, requiredEpsilon, details);
```

Between the `enforceBudget` check and the `consumeBudget` call, another concurrent request can consume the remaining budget. This is a classic TOCTOU (Time-of-Check-Time-of-Use) race condition.

The `PrivacyBudgetRepository` (which `consumeBudget` delegates to) uses a PostgreSQL database. However, without a `SELECT ... FOR UPDATE` lock or a serializable transaction, two concurrent `consumeBudget` calls can both succeed, each reading the same `currentEpsilon` value and writing back independently — the last write wins, and the first consumption is silently lost from the budget tracking.

This is distinct from Issue #9 (the **in-memory** race condition in `differentialPrivacy.ts`). This issue is about the **database-backed** PostgreSQL budget service, which has different concurrency semantics but the same fundamental vulnerability.

### Acceptance Criteria
1. Combine `enforceBudget` and `consumeBudget` into a single atomic operation `enforceAndConsume(datasetId, orgId, amount, details)` that uses a database transaction with row-level locking
2. In the repository layer, use `SELECT ... FOR UPDATE` on the budget row before updating, ensuring serialized access across concurrent consumers
3. If the database doesn't support row locking, implement an advisory lock (PostgreSQL `pg_advisory_xact_lock`) scoped to the budget ID
4. Write a concurrency test that fires 20 simultaneous requests each consuming 0.1 epsilon from a budget of 1.0 epsilon, and verifies exactly 10 succeed and 10 fail (no double-consumption)
5. Write a test proving that a mid-transaction crash rolls back the consumption (budget is not decremented)
6. Add a Prometheus counter `privacy_budget_contention_total` that increments when a `FOR UPDATE` lock wait occurs

---

## Issue #26: No Input Validation on Gateway Policy CRUD Endpoint — Arbitrary Policy Injection

**Severity:** High  
**Area:** Backend — Input Validation  
**File:** `backend/src/gateway/PrivacyApiGateway.ts:536-548`

### Description
The `POST /gateway/policies` endpoint passes the raw `req.body` directly to the policy engine without any validation:

```typescript
private async updatePolicy(req: Request, res: Response): Promise<void> {
  try {
    const policy = req.body;
    await this.policyEngine.updatePolicy(policy);
    res.json({ message: "Policy updated successfully", policyId: policy.id });
  } catch (error) {
    res.status(400).json({ error: "Policy Update Failed", message: error.message });
  }
}
```

This is distinct from Issue #7 (missing authentication on this endpoint). Even if authentication is added, the following injection attacks remain possible:

- **Prototype pollution:** `req.body` can contain `__proto__` or `constructor.prototype` keys that pollute the policy engine's object prototype
- **Missing fields:** A policy without required fields (`id`, `rules`, `priority`) causes downstream crashes in `evaluateRequest` when it tries to iterate `policy.rules`
- **Invalid rule operators:** Rule operators like `"__proto__"` or `"constructor"` as `rule.operator` cause unexpected behavior in `evaluateRule`
- **Massive payloads:** No size limit on policy objects — an attacker can submit a multi-megabyte policy body causing memory exhaustion
- **XSS in policy names:** Policy `name` and `description` fields are reflected in API responses and admin dashboards without sanitization
- **Injection via rule values:** A rule with `attribute: "request.path"`, `operator: "regex"`, and `value: "(a+)+$"` creates a ReDoS (see Issue #8) through the policy CRUD endpoint

### Acceptance Criteria
1. Add a Zod or Joi schema that validates all policy fields: `id` (string, required), `name` (string, max 200 chars), `rules` (array, min 1), `priority` (number, min 0), `enabled` (boolean)
2. Validate each rule within a policy: `attribute` (enum of known attributes), `operator` (enum of known operators), `value` (string, max 1000 chars), `action` (enum: allow/deny/transform/log)
3. Reject requests with unknown/extra fields (strict mode) to prevent prototype pollution
4. Limit request body size for policy endpoints specifically (e.g., 100KB — smaller than the global 10MB limit)
5. Sanitize policy name and description fields to strip HTML/script tags before storage
6. Write tests for each injection vector: prototype pollution, missing fields, oversized payload, XSS in names
7. Validate that regex `value` fields pass a ReDoS safety check before storage (complementary to Issue #8)

---

## Issue #27: APIKeyManager Stores All API Keys Only In-Memory — Complete Key Loss on Restart

**Severity:** High  
**Area:** Backend — Key Management  
**File:** `backend/src/gateway/APIKeyManager.ts:80,95-105`

### Description
All API keys are stored exclusively in an in-memory `Map<string, APIKey>`:

```typescript
private keys: Map<string, APIKey>;
```

When the server restarts (deployment, crash, OOM kill, container reschedule):
- **All API keys are permanently lost** — there is no database persistence, no Redis backup, no file-based recovery
- **The development admin key** (`"admin_key_default"`) is regenerated with a **different value** on each restart — any client using the previous key is locked out
- **All user-created keys disappear** — clients receive `401 Invalid API Key` errors and must request new keys
- **Usage logs** (`usageLogs` array) are also in-memory, so all audit trail for key usage is lost
- **Key rotation is impossible** — you can't rotate a key that only exists in volatile memory

This creates an operational nightmare: every deployment causes a production outage for all API-key-authenticated clients until keys are manually redistributed.

### Acceptance Criteria
1. Persist API keys to the PostgreSQL database via a `api_keys` table with columns: `id`, `name`, `key_hash`, `key_prefix`, `permissions` (JSONB), `rate_limit` (JSONB), `restrictions` (JSONB), `metadata` (JSONB), `created_at`, `expires_at`, `last_used_at`, `is_active`
2. On startup, load all active, non-expired keys from the database into the in-memory cache
3. Use `timingSafeEqual` for hash comparison (already implemented — keep this)
4. Store the `keyHash` using a salted hash (currently unsalted SHA256 — add a per-key random salt stored alongside the hash)
5. Add a key rotation API: `POST /keys/:id/rotate` that generates a new key value, updates the hash, and returns the new key exactly once (never stored in plaintext)
6. Write a migration to create the `api_keys` table
7. Write a test: create key → restart the APIKeyManager → validate the same key still works

---

## Issue #28: Unauthenticated Metrics Endpoint Exposes System Internals in Development Mode

**Severity:** Medium  
**Area:** Backend — Information Disclosure  
**File:** `backend/src/index.ts:204-231`

### Description
Two admin endpoints expose detailed operational metrics with a broken authentication check:

```typescript
app.get("/api/v1/admin/rate-limit/metrics", (req, res) => {
  if (process.env.NODE_ENV === "production" && !(req as any).user?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const metrics = rateLimitMonitor.getMetricsSummary();
  res.json({ metrics, timestamp: new Date().toISOString(), environment: process.env.NODE_ENV });
});
```

The check `!(req as any).user?.isAdmin` is **always true when auth middleware is missing** (see Issue #4): `!undefined?.isAdmin` → `!undefined` → `true`, so in production mode **without auth middleware**, the endpoint always returns 403. **However, in development mode** (`NODE_ENV !== "production"`), the check is skipped entirely and the endpoint returns detailed metrics unconditionally to any caller.

The `/api/v1/admin/rate-limit/config` endpoint has the exact same vulnerability (lines 219-231).

The exposed information includes:
- Total requests and blocked request counts (revealing traffic patterns)
- Per-rate-limiter statistics (revealing which endpoints are most/least protected)
- Block rate percentages (revealing attack detection effectiveness)
- Rate limit configuration (window sizes, request limits per tier, which features are enabled)
- Environment name (confirming development vs production)

This information enables attackers to:
- Map the API's rate limiting landscape and identify the least-protected endpoints
- Determine whether burst protection, collision detection, and adaptive limiting are active
- Calibrate attack volumes to stay just below rate limits

### Acceptance Criteria
1. Remove the `NODE_ENV !== "production"` bypass — the endpoint must require authentication in ALL environments
2. Apply `stellarAuth.authenticate` middleware specifically to these admin routes
3. Implement proper role-based access: only users with `admin` role can access these endpoints
4. In development mode, if authentication is desired but simplified, use a configurable development admin token (set via env var, never hardcoded)
5. Never expose full rate limit configuration to unauthenticated clients — return a minimal subset (e.g., only whether rate limiting is enabled)
6. Write tests: unauthenticated → 401 in all environments, non-admin → 403 in all environments, admin → 200 with metrics

---

## Issue #29: ServiceRegistry Connects to Redis Without Authentication Across All Code Paths

**Severity:** High  
**Area:** Backend — Service Discovery  
**File:** `backend/src/services/ServiceRegistry.ts:48-50`

### Description
The `ServiceRegistry` constructor creates a Redis client from a URL without any authentication:

```typescript
constructor(redisUrl: string) {
  super();
  this.redis = Redis.createClient({ url: redisUrl });
  this.initializeRedis();
}
```

And it's instantiated with a hardcoded fallback URL:

```typescript
// In backend/src/index.ts:435-436
const serviceDiscovery = new ServiceDiscovery({
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  ...
});
```

If `REDIS_URL` is not set in production (or is misconfigured), the system silently falls back to connecting to `localhost:6379` without any password. If a Redis instance is running on localhost (common in development environments that accidentally run in production mode), the service registry connects without authentication.

Even when `REDIS_URL` is set, there is no enforcement that the URL includes authentication credentials. A URL like `redis://redis:6379` (without password) is accepted without warning.

The ServiceRegistry stores:
- All service instance registrations (IPs, ports, metadata)
- Health check results
- Service mesh routing tables

An attacker who gains access to this Redis instance can read the entire infrastructure topology.

### Acceptance Criteria
1. Validate the Redis URL at connection time: if no password/authentication is present, emit a warning (in development) or refuse to start (in production)
2. Add a `requirePassword` configuration option that, when true, rejects Redis URLs without credentials
3. Remove the hardcoded `redis://localhost:6379` fallback — crash on startup if `REDIS_URL` is not provided
4. Support Redis ACL username/password in the URL format (`redis://user:pass@host:port`)
5. Add TLS support for Redis connections (`rediss://` protocol prefix)
6. Write a test that proves the system refuses to start when given a passwordless Redis URL in production mode
7. Document the required Redis URL format in the deployment guide

---

## Issue #30: KillSwitchService Auto-Recovery Disabled by Default in Production — Permanent System Lockout

**Severity:** High  
**Area:** Backend — Resilience  
**File:** `backend/src/index.ts:453-457`

### Description
The HSM integration is initialized with auto-recovery explicitly disabled:

```typescript
const hsmIntegration = getHSMIntegration({
  autoInitializeMasterKey: true,
  enableAutoRecovery: false,  // ← explicitly disabled
  auditRetentionDays: 90,
});
```

When the KillSwitchService activates (due to any trigger — failed authentications, suspicious requests, key anomalies, system errors, or HSM connection failures), the system enters a locked-down state where:
- The HSM kill switch is engaged, preventing all cryptographic operations
- The master key cache is cleared
- Auto-recovery is **disabled**, so the system will **never automatically recover**
- Manual intervention is required to call `deactivate()` on the KillSwitchService

Combined with Issue #19 (threshold evasion), this creates a dangerous scenario:
1. An attacker triggers the kill switch (e.g., by causing HSM connection failures or flooding auth failures)
2. The system locks down — all crypto operations stop, essentially DoS-ing the platform
3. Auto-recovery is disabled, so the system stays locked indefinitely
4. An operator must manually deactivate the kill switch, which requires:
   - Detecting the lockout (monitoring alert)
   - Authenticating with admin credentials
   - Calling the deactivation API endpoint
   - Verifying system health before restoring service

This creates a single point of operational failure. During off-hours or when the on-call engineer is unavailable, the system remains completely non-functional.

### Acceptance Criteria
1. Enable auto-recovery by default with a reasonable delay (e.g., 5 minutes) and exponential backoff
2. Add a maximum auto-recovery attempt limit (e.g., 5 attempts) after which the system stays locked and escalates to human operators
3. Implement a "circuit breaker" pattern for the kill switch: auto-recovery attempts a single probe request; if it succeeds, fully restore; if it fails, double the backoff
4. Add a separate "HSM transient failure" trigger that has a shorter auto-recovery delay (30 seconds) compared to "security incident" triggers (5+ minutes)
5. Write a test: trigger kill switch via threshold breach → verify auto-recovery attempts after delay → verify successful recovery → verify system returns to normal operation
6. Write a test: trigger kill switch via HSM failure → verify different (shorter) recovery delay than security incident trigger
7. Add a Prometheus gauge `kill_switch_recovery_attempts` tracking recovery attempt count per activation

---

