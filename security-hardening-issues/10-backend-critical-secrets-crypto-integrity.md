# (Critical) Secret Management & Crypto Material Integrity: Hardcoded Keys and Theater HSM

**Epic · Backend · Backend 5 of 5**

## Epic Summary

The encryption and key-management stack is built on source-known material: the storage master key falls back to a non-hex literal that is mis-parsed into a deterministic weak AES-256-GCM key, `DB_PASSWORD` defaults to `"postgres"` in the env schema, JWT/audit/API-key secrets all have hardcoded fallbacks, and the "HSM" generates a random GCM tag instead of a real one while shipping plaintext key material to a remote endpoint. There is no fail-fast validation of required secrets, and a data-key cache reuses keys across users. These workstreams are coupled: the fail-fast validator (W1) is the gate that makes every other fix enforceable; storage encryption (W2) depends on real wrapping (W3); key-cache correctness (W4) depends on the key hierarchy from W2/W3; and audit/ZK material protection (W5) needs the inventory and CI scanning from W1.

## Affected Components

`backend/src/config/env.ts`, `backend/src/index.ts`, `backend/src/services/storageService.ts`, `backend/src/services/hsmService.ts`, `backend/src/services/hsmIntegration.ts`, `backend/src/services/masterKeyManager.ts`, `backend/src/middleware/stellarAuth.ts`, `backend/src/services/auditService.ts`, `backend/src/routes/hsm.ts`, `.env.example`, `.github/workflows/ci.yml`

---

## Workstream 1 — Fail-fast secret validation and full default removal

**Objective:** The application must refuse to start with missing or default secrets.

**Problem:** `config/env.ts` declares `DB_PASSWORD: Joi.string().allow("").default("postgres")` — the schema itself bakes in the credential; `index.ts` falls back to `STORAGE_MASTER_KEY || "default-master-key-32-chars-long!!!"` and `DB_PASSWORD || "postgres"`; `stellarAuth.ts` and `routes/auth.ts` fall back to `"stellar-privacy-jwt-secret-dev-only"`; `auditService.ts` falls back to `"default-key"`; `hsmService.ts`/`rateLimiter.ts` have their own defaults (covered in their epics). No startup check rejects these.

**Scope:** `config/env.ts`, `index.ts` service init, all constructor fallbacks, `.env.example` and `README.md` documentation.

**Implementation:**
1. Rewrite the env schema: all secret variables (`DB_PASSWORD`, `JWT_SECRET`, `API_KEY_SECRET`, `STORAGE_MASTER_KEY`, `AUDIT_SIGNATURE_KEY`, `RATE_LIMIT_EMERGENCY_BYPASS_KEY`, HSM creds) are `required()`, must be non-empty, and must not equal any known default; startup throws with a clear message listing each missing secret.
2. Remove every `|| "default..."` fallback across the services; a `validateSecrets()` module runs before any service construction.
3. Add a startup integration test that boots without env vars and asserts a hard failure.
4. Update `.env.example` with explicit "generate for production" guidance and add a `scripts/generate-secrets.ts` that emits compliant values.

**Acceptance Criteria:**
1. Booting with missing, empty, or default-valued secrets fails in all environments (including development).
2. No `|| "default-...` secret fallback remains anywhere in `src/`.
3. The failure message lists the offending variable(s) and hints.
4. `.env.example` contains no real secrets and documents generation.

**Testing:** Startup-failure matrix tests (each secret missing/empty/default); a repo-wide grep lint banning known default strings; script-generation tests.

## Workstream 2 — Real envelope encryption for stored data

**Objective:** Each stored object must be encrypted under its own data key, wrapped by a managed master key — not one shared, source-known key.

**Problem:** `storageService.ts` `constructor(masterKey)` does `Buffer.from(masterKey, "hex")` — the default `"default-master-key-32-chars-long!!!"` is not hex, so Node's hex decoder produces a short, deterministic key; every ciphertext under AES-256-GCM is decryptable by anyone with the source. All objects share the single master key (no per-object DEK), there is no key rotation for stored data, and the master key material sits in process memory with no HSM involvement on this path.

**Scope:** `storageService.ts`, `masterKeyManager.ts`, upload/storage call sites, `routes/encrypted-upload.ts` (return of plaintext keys).

**Implementation:**
1. Envelope encryption: per-object random DEK → AES-256-GCM data → DEK wrapped by the master key via the HSM (W3); store `wrapped_dek`, `iv`, `tag`, `key_id` in the metadata.
2. Accept the master key as 32 raw bytes from env (base64/hex with strict parsing); reject non-conforming values.
3. Implement rotation that re-wraps DEKs (or documents a re-encryption pass) without invalidating existing objects.
4. Stop returning plaintext keys from upload/encrypt endpoints; callers get wrapped keys and decrypt through the key-management API (which itself is admin-gated in the authn epic).

**Acceptance Criteria:**
1. Two objects stored with the same master key have different DEKs; compromising one ciphertext+DEK does not expose others.
2. The default/known key cannot be used to decrypt newly stored data (test decrypts with the old default → failure).
3. Master-key rotation does not orphan existing data (retrieval still works after rotation).
4. No endpoint returns a plaintext DEK to the caller.

**Testing:** Envelope-encryption round-trip tests; key-uniqueness tests; rotation compatibility tests; default-key regression tests (old default must not decrypt).

## Workstream 3 — Make the HSM integration real or fail closed

**Objective:** Key wrapping must be cryptographically real, or the feature must be disabled loudly.

**Problem:** `hsmService.ts` `wrapKey` sends `plaintext` (base64) of the key material to the remote endpoint and then **fabricates the GCM tag with `randomBytes(16)`** — the tag is not the result of any authenticated encryption, so "wrapped" keys have no integrity guarantee; `unwrapKey` trusts whatever the endpoint returns; the master key is generated with `randomBytes(32)` in app memory (`masterKeyManager.initializeMasterKey`) rather than inside an HSM, so the "master key never leaves the HSM" claim is false; and there is no verification that the endpoint is a real HSM (any HTTP endpoint returns "success").

**Scope:** `hsmService.ts` (`wrapKey`, `unwrapKey`, `makeHSMRequest`), `hsmIntegration.ts`, `masterKeyManager.ts`, `routes/hsm.ts` status surfaces.

**Implementation:**
1. Either integrate a real KMS/HSM SDK (with authenticated wrapping where the tag comes from the HSM response and is verified locally on unwrap), or remove the remote call and implement software key wrapping with a locally held, HSM-stored root — with the wrapping verified (decrypt-with-wrong-tag fails).
2. Verify unwrap responses: integrity check (tag/AEAD verification), key-id/version binding, and mismatch → hard failure.
3. Move master-key generation into the HSM (or a dedicated KMS API); never generate master material in app memory; document where each key lives.
4. Add a startup self-test that performs a wrap→unwrap round trip and fails initialization on verification failure (no "initialized" without proof).

**Acceptance Criteria:**
1. A corrupted wrapped key fails to unwrap (integrity enforced) — currently the random tag makes this impossible to detect.
2. The master key is generated and held by the HSM/KMS; app memory never contains master material (test asserts no in-app master-key bytes).
3. Startup self-test proves wrap→unwrap round-trip before the API reports healthy.
4. The HSM status/health surfaces reflect real verification results, not `connectionHealth = true` defaults.

**Testing:** Tampered-wrapped-key tests; key-generation-location tests (code inspection + runtime assertions); startup self-test tests; HSM-outage fail-closed tests.

## Workstream 4 — Fix data-key caching and cross-user key reuse

**Objective:** Data keys must be bound to their legitimate holder and never reused across principals.

**Problem:** `masterKeyManager.ts` `createCacheKey` hashes `(purpose, userId, context)` with no randomness: every anonymous/service caller with the same `purpose` gets the **same cached plaintext key**, and `decryptDataKey` returns the cached key to anyone who presents the same cache key — data encrypted by one principal is decryptable by another. `generateDataKey` returns `plaintextKey` in the response (see W2), and the cache is not invalidated on key revoke/rotate for the affected entries (only cleared globally).

**Scope:** `masterKeyManager.ts` (`createCacheKey`, `generateDataKey`, `decryptDataKey`, cache invalidation), `routes/hsm.ts` callers.

**Implementation:**
1. Bind keys to the authenticated principal: include a per-user random salt (or the user's session identity) in the cache key; never serve a cached plaintext key to a different principal.
2. Cache only wrapped keys + a short-lived decrypted copy strictly scoped to the requesting principal, with per-entry TTL; purge on revoke/rotate for the affected principal.
3. Remove plaintext-key return from `generateDataKey` responses (return wrapped only; decrypt happens server-side within an authorized operation).
4. Add a principal check inside `decryptDataKey` — the caller must match the key's binding.

**Acceptance Criteria:**
1. Two users with the same `purpose`/`context` receive different keys; each can decrypt only their own.
2. A cached plaintext key is never returned to a different principal.
3. Revoking a key invalidates its cache entries immediately.
4. No API response contains a plaintext DEK.

**Testing:** Cross-user key tests; cache-scope tests; revocation-invalidation tests; response-content assertions.

## Workstream 5 — Protect audit & ZK material; secrets scanning in CI

**Objective:** Cryptographic material and audit trails must be protected at rest, and default secrets must never re-enter the repo.

**Problem:** `auditService.ts` signs with `"default-key"` (W1 covers the removal; here: at-rest protection) and stores plaintext JSON; `utils/audit.ts` persists request/response bodies (see audit-logging epic); `zkpService.ts` returns fake proofs and has an unbounded cache; and nothing scans the repo for committed secrets — `.env.example` and past commits already demonstrate the pattern of shipping defaults.

**Scope:** `auditService.ts` at-rest handling, `utils/audit.ts`, `zkpService.ts`, `.github/workflows/ci.yml` secrets scan, `.gitignore`/`.env` hygiene.

**Implementation:**
1. Encrypt audit records at rest (AES-256-GCM with a managed key from W1) or enforce file-level permissions + append-only rotation; stop writing bodies (from the audit-logging epic).
2. Replace fake ZK proof generation/verification with real integration or explicit `501` (from the consistency epic); bound the proof cache.
3. Add a secrets-scanning job to CI (e.g., gitleaks) covering all workspace packages, failing on any high-confidence secret; add a pre-commit hook.
4. Verify `.gitignore` excludes `.env*` except `.env.example`, and that no committed file contains a live secret (scan the history for the known defaults).

**Acceptance Criteria:**
1. Audit files at rest are encrypted or permission-protected; no plaintext bodies or secrets within.
2. `verifyIntegrity` (with the managed key) passes after a clean run and fails after any tampering.
3. CI secrets scan fails on committed secrets; the repo history scan for the known defaults is documented and clean.
4. No ZK proof is accepted without real verification (or a 501).
5. `.env*` (except `.env.example`) is git-ignored and never committed.

**Testing:** At-rest encryption tests; integrity tamper tests; CI scan self-test (commit a test secret in a branch → scan fails); ZK acceptance tests; gitignore compliance test.

---

## Shared Acceptance Criteria (build · tests · lints · CI gates)

1. `npm run build`, `npm run type-check`, `npm run lint` pass and are blocking.
2. `npm test` green, including startup-failure, envelope-encryption, HSM round-trip, cache-scope, and at-rest protection suites.
3. A secrets-scan job (gitleaks) runs in `.github/workflows/ci.yml` and fails the pipeline on any finding; the backend job is blocking with no `continue-on-error`.
4. A repo-wide lint bans the known default secret strings and `|| "default-..."` fallbacks.
5. Cross-epic gates: the authn epic consumes the validated `JWT_SECRET`/`API_KEY_SECRET` from this epic; the audit-logging epic uses the managed signing key and at-rest encryption from this epic; startup validation here must pass before any other backend epic's CI can be green.
