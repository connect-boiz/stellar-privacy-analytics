# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Stellar seriously. If you believe you have found a
security vulnerability, please report it to us as outlined in the
[Responsible Disclosure](#responsible-disclosure) section below.

### Reporting Process

1. **Do NOT** file a public issue for security vulnerabilities.
2. **Do NOT** include secrets, credentials, or production data in your report.
3. Provide as much information as possible about the vulnerability, including:
   - The affected component and version
   - A step-by-step description of how to reproduce the issue
   - Proof-of-concept code, if available
   - The potential impact
4. Send your report to the maintainers.

Our maintainers acknowledge receipt of security reports within 24-48 hours.
We aim to provide a detailed response and remediation plan within 5 business
days.

### Responsible Disclosure

We ask that you follow responsible disclosure:

- Allow us time to address and fix the vulnerability before public disclosure.
- Provide a reasonable disclosure deadline (e.g., 90 days) in your report.
- We strongly prefer coordinated disclosure. We will credit researchers who
  coordinate responsibly (unless they prefer to remain anonymous).

## Security Features

Stellar includes several built-in security features:

### Data Protection

- **End-to-end encryption** using AES-256-GCM
- **Differential privacy** with configurable epsilon values
- **Zero-knowledge architecture** preventing data exposure
- **Secure key management** with hardware security module (HSM) support

### Access Control

- **Role-based access control** (RBAC)
- **Multi-factor authentication** (MFA)
- **JWT-based authentication** with short expiration
- **API rate limiting** and DDoS protection

### Privacy Protection

- **Privacy budget management** preventing data leakage
- **Consent management** with audit trails
- **Data retention policies** with automatic deletion
- **Anonymization techniques** for sensitive data

### Infrastructure Security

- **Container security** with minimal attack surface
- **Network isolation** using micro-segmentation
- **Regular security scanning** and vulnerability assessment
- **Compliance monitoring** for GDPR, CCPA, and other regulations

## Security Hardening Notes (issue #413)

The issues listed below drove the hardening work in the backend (off-chain
surface). On-chain Soroban contract hardening is tracked separately.

### Authentication & Authorization (WS1)

- A **global authentication middleware** is mounted on the API router and
  applied by default to every route. Public endpoints (health checks, auth
  login/register, well-known docs) are explicitly exempted via a whitelist.
- **`/hsm` and admin endpoints require the `admin:access` permission** and no
  longer trust client-supplied identity headers.
- Dataset queries are **scoped to the authenticated owner** (`datasets.owner_id`);
  cross-owner access returns 403 instead of leaking other users' data.
- `stellarAuth` no longer falls back to a hardcoded JWT secret, and Bearer
  tokens are no longer treated as API keys.

### Secret Management (WS2)

- **All hardcoded secret fallbacks have been removed** and consolidated into a
  single auditable module (`src/utils/secrets.ts`).
- The backend runs a **fail-closed boot-time secret audit** in production
  (`config/env.ts`); it refuses to start if a required secret is missing or
  still set to a known development default.
- **HSM is the source of truth for master keys.** When `HSM_ENDPOINT` is set,
  the master key is generated and persisted via the HSM and never held in app
  memory. Records are written to `master_keys`/`wrapped_keys` tables.
- **GCM authentication tags come from the HSM response.** The client never
  fabricates a tag; a wrap without a real tag fails closed.

### Input Validation & Injection Defense (WS3)

- **Shared JSON-schema validation** is applied to mutating routes via a central
  schema registry, replacing inconsistent per-route ad-hoc checks.
- **SQL identifiers used in sandbox setups are parameterized/whitelisted**.
- **CSV export escapes cells** that begin with `= + - @` to prevent spreadsheet
  formula (CSV injection) attacks.
- **Upload sizes are verified server-side** before any processing.

### Idempotency & Race Safety (WS4)

- Mutating endpoints accept an **`Idempotency-Key` header**, so retried or
  duplicated requests cannot double-spend, double-award, or create duplicates.
- **Privacy-budget consumption is atomic** (row-lock transactions) and recorded
  to an auditable `budget_transactions` table.

### Audit, Rate Limiting & 5xx/DoS Defense (WS5)

- **Audit records are hash-chained** (`prev_hash`), so tampering with any
  record is detectable via `verifyIntegrity`.
- **The public rate-limit emergency bypass has been removed.** The default no
  longer opens the limiter to unauthenticated callers; Redis failure makes the
  limiter **fail closed** rather than allow traffic through.
- **`app.set("trust proxy", true)`** is set so client IPs used for rate
  limiting are reliable behind a reverse proxy (and never trusted from
  spoofed `X-Forwarded-For` headers without the proxy).
- **Auth endpoints are rate-limited and accounts are locked** after repeated
  failed attempts.

## Security Best Practices

### For Developers

1. **Follow secure coding practices**