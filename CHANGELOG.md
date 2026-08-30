# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security (issue #413 — backend hardening epic)

#### WS1 — Authentication & Authorization
- Mounted a **global authentication middleware** on the API router, applied by
  default with an explicit whitelist for public endpoints.
- **`/hsm` and all admin endpoints now require the `admin:access` permission**;
  client-supplied identity headers are no longer trusted.
- Dataset queries are **scoped to the authenticated owner** (`datasets.owner_id`);
  cross-owner access returns `403`.
- Removed the hardcoded JWT secret fallback; bearer tokens are no longer treated
  as API keys.
- Added an `api_keys` table for server-issued API keys, verified via
  constant-time digest comparison.

#### WS2 — Secret Management
- **Removed every hardcoded secret fallback** and centralized the dev-only values
  in `src/utils/secrets.ts`.
- Added a **fail-closed boot-time secret audit** (`config/env.ts`) that aborts a
  production process when a required secret is missing or set to a known default.
- Made the HSM the **source of truth for master keys**: when `HSM_ENDPOINT` is
  set, master keys are generated and persisted via the HSM, never held in app
  memory; records are written to `master_keys`/`wrapped_keys` tables.
- GCM authentication tags now **must come from the HSM response** — the client
  never fabricates a tag, and a wrap without a tag fails closed.

#### WS3 — Input Validation & Injection Defense
- Added a **shared JSON-schema registry** and `validateRequest` on all mutating
  routes, replacing inconsistent ad-hoc checks.
- **Parameterized/whitelisted SQL identifiers** used in sandbox setups.
- **CSV cells are escaped** against spreadsheet-formula injection (`= + - @`).
- Verified upload sizes server-side; hardened the IPFS route with CID validation.

#### WS4 — Idempotency & Race Safety
- Mutating endpoints accept an **`Idempotency-Key` header** (24h TTL) so retried
  requests cannot double-spend or create duplicates.
- **Privacy-budget consumption is atomic** (row-lock transactions) and recorded
  to an auditable `budget_transactions` table.
- Added training-attempt guards and durable, transactional audit writes.

#### WS5 — Audit, Rate Limiting & DoS Defense
- **Audit records are hash-chained** (`prev_hash`); `verifyIntegrity` detects
  tampering with any record.
- **Removed the public rate-limit emergency bypass.** The limiter now **fails
  closed** when Redis is unavailable instead of opening to traffic.
- Enabled `trust proxy` so rate-limiting IPs are reliable behind a reverse
  proxy without trusting spoofed `X-Forwarded-For` headers.
- **Auth endpoints are rate-limited** and accounts are **locked after repeated
  failures**.
- Added process hardening (fail-closed on missing critical config).

### CI & Tooling
- Removed the `|| echo` masks on `type-check` and `build` so CI now **fails** on
  regressions instead of silently passing.
- Fixed all pre-existing backend TypeScript type errors.
- Documented required production secrets in `.env.example` and expanded
  `SECURITY.md` with the hardening controls.

### Tests
- Extended the auth, data, admin-rate-limit, and HSM integration suites to the
  new security posture.
- Added `src/__tests__/security-hardening.test.ts` covering WS1 secret handling,
  WS3 CSV injection escaping, and WS5 audit tamper detection.