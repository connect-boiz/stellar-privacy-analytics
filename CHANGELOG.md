# Changelog

All notable changes to Stellar Privacy Analytics will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure and setup
- Privacy-first X-Ray analytics engine
- Stellar blockchain integration with Soroban smart contracts
- React frontend with privacy controls
- Node.js backend with encryption services
- Docker deployment configuration
- Comprehensive documentation
- CI/CD pipeline with GitHub Actions

### Security
- End-to-end encryption using AES-256-GCM
- Differential privacy implementation
- Zero-knowledge proof architecture
- Privacy budget management system
- **UpgradeableProxy: add caller.require_auth() on all mutating entry points**
  (`initiate_upgrade`, `complete_upgrade`, `cancel_upgrade`, `set_upgrade_delay`,
  `transfer_admin`) to prevent caller-spoofing attacks where any contract could
  impersonate the admin by passing the stored admin Address as the `caller` argument.
  Fixes #297.
- **DataSovereigntyContract: keep check_access auth-free for cross-contract composability**
  Added a RelayContract inside the test suite that exercises `check_access` in a true
  contract-to-contract flow. If `caller.require_auth()` is ever re-introduced, the
  host-level auth panic fails the regression test. Fixes #294.
- **UpgradeableProxy: refactor with shared `verify_admin` helper and front-running protection**
  Centralized `caller.require_auth()` + stored-admin equality into a single
  `Self::verify_admin(&env, &caller)` helper used by every mutating entry point
  (`initiate_upgrade`, `complete_upgrade`, `cancel_upgrade`, `set_upgrade_delay`,
  `transfer_admin`). This prevents future mutating methods from accidentally
  omitting host-level auth.
- **UpgradeableProxy: require admin auth on `initialize`**
  Defense-in-depth against front-running between contract deployment and the
  legitimate admin's setup transaction.
- **StellarAnalytics: take an explicit authenticated `caller` in admin/oracle entry points**
  `add_oracle`, `add_privacy_budget`, `update_data_availability`, `pin_dataset`,
  `complete_analysis` and `cancel_analysis` previously derived the caller from
  `env.current_contract_address()`, so no external address could ever satisfy
  the admin/oracle/requester checks and the whole oracle onboarding → analysis
  completion → cancellation lifecycle was dead code. Each function now takes an
  explicit `caller: Address` argument guarded by `caller.require_auth()`, and
  the test suite proves a real admin can add oracles and complete analyses while
  non-admins, non-oracles and non-requesters are rejected. Fixes #396.

## [Unreleased] — Production-hardening epic (issue #412)

### Security
- **WS1 — host-level caller authentication across the contract suite**
  - `PrivacyOracle`: all seven mutating entry points (`request_data`, `fulfill_request`,
    `cancel_request`, `add_oracle_node`, `remove_oracle_node`, `add_deposit`, `withdraw`)
    now take an explicit `caller: Address` guarded by `caller.require_auth()`; the
    `env.current_contract_address()`-as-actor pattern is fully removed. Oracle onboarding,
    fee debiting and deposit withdrawal now attribute to real authenticated actors.
  - `MultiSigAdmin`: every public function (including `initialize`) requires host auth.
    `initialize` requires each listed owner's signature, so deployment cannot be
    front-run by an attacker registering themselves as sole owner.
  - `DataSovereigntyAccessControl`: `register_resource` requires an authenticated
    caller that is the stored admin or a privileged registrar.
  - `StellarAnalytics`: `register_dataset` / `create_dataset_version` require the
    uploader's signature (consent fix mirroring `request_analysis`).
- **WS2 — arithmetic invariants & accounting integrity**
  - Collision-proof `request_id`s: a per-user monotonic nonce is mixed into the hash
    input, so two identical requests in the same ledger yield distinct ids and cannot
    double-charge the budget via overwrite.
  - `OnChainAggregator::process_aggregation` now enforces
    `total_epsilon_spent <= request.privacy_budget` (fails with `InsufficientPrivacyBudget`
    before storing a result).
  - All balance/counter arithmetic uses `checked_add`/`checked_sub` (fail-closed on overflow).
  - `verify_state` invariant hook (budget ≥ 0, counters consistent with underlying maps)
    runs after every mutation in all five audited contracts — `StellarAnalytics`,
    `PrivacyOracle`, `OnChainAggregator` (incl. `process_aggregation`),
    `AccessControl` and `TtlStorage` — each with a regression test that
    deliberately corrupts a ledger and asserts the fail-closed path.
- **WS3 — re-entrancy & gas-DoS hardening**
  - Per-user storage keys (`(Symbol, Address)`) replace whole-map instance keys for
    budgets, deposits and permissions; `check_access` is a direct O(1) lookup with
    access-log writes removed from the check path.
  - `process_aggregation` guards `calculate_noise` against zero participants (no panic/DoS)
    and derives the processor from auth with a status-transition guard against reprocessing.
  - Cross-contract re-entrancy test: a consumer `AccessRelay` contract invokes
    `check_access` contract-to-contract (no end-user signature needed) and proves
    the invocation cannot mutate the caller's own state mid-call.
  - `perform_*` aggregations enforce strict value-format checks. Privacy
    certificates now carry a `privacy_proofs_nonce` that binds the request,
    result, processor and ledger timestamp, plus a non-empty on-chain signature
    commitment, and `get_privacy_certificate` rejects (reports absent) any
    certificate with an empty signature or unbound nonce — no certificate
    asserts integrity it does not provide.
- **WS4 — upgrade & storage safety**
  - `UpgradeableProxy` converted to a verified-implementation registry: implementations
    must be registered (`register_implementation`) before `initiate_upgrade`, upgrades
    are blocked on storage-layout version mismatch (`storage_version`), and admin
    transfer is two-step (`transfer_admin` → `accept_admin_transfer`).
  - `TtlStorage`: persistent entry/fee-record/index TTLs are bumped alongside chunks;
    `store_data` fails for un-coverable TTLs instead of silently truncating;
    `remove_entry` reads the entry before removal so chunks/fees are never orphaned;
    `cleanup_worker` is now rotatable via `rotate_cleanup_worker` (admin-authenticated).
- **WS5 — invariant harness, event integrity & CI gates**
  - `invariant_testing` converted to an internal-only checked-math property library
    (no external entry points).
  - Payload-bearing events with monotonically increasing nonces: `analysis_requested`,
    `data_requested`, oracle add/remove publish full request parameters, enabling
    indexers to reconstruct `get_stats()` counters exactly from the event stream.
    `AccessControl`, `TtlStorage` and `UpgradeableProxy` events also carry the
    same replay-detection nonce, and `StellarAnalytics` `initialize`/`pin_dataset`
    now emit payload-bearing events too — every audited contract's events are
    indexer-replay-safe.
  - Access-log writes are private (no external mutation) and capped; grant/revoke
    events carry the full audit trail.
  - CI: `continue-on-error: true` removed from `cargo test` and the WASM build;
    added `cargo test --release` and a grep-based security gate (bans
    `env.current_contract_address()` in actor position and whole-map instance-storage
    keys in the audited contracts).

### Changed
- **Contracts restructured into a cargo workspace** — each contract is now its own
  crate (`contracts/<name>/`) producing its own `.wasm` artifact
  (`target/wasm32-unknown-unknown/release/<name>.wasm`), matching
  `soroban-project.yml` and `scripts/deploy.ts` expectations. The previous
  single-crate layout could not compile for `wasm32-unknown-unknown` at all
  (duplicate `initialize`/`get_stats` export symbols; missing `#![no_std]`), a
  failure hidden by `continue-on-error: true`.
- All contract crates are `#![no_std]` (removes the std `panic_impl` conflict on
  wasm32 with Rust ≥ 1.87).
- `PrivacyOracle::get_stats` renamed `get_oracle_stats` to avoid the duplicate
  export with `StellarAnalytics::get_stats`.
- `test_snapshots/` artifacts (regenerated per test run, never read) removed from
  version control and gitignored.

## [1.0.0] - 2024-03-16

### Added
- **Core Features**
  - X-Ray Analytics engine with privacy preservation
  - Stellar smart contracts for transparency
  - Real-time privacy dashboard
  - Multi-level privacy controls (Minimal, Standard, High, Maximum)
  - Privacy budget management
  - Audit logging and compliance tracking

- **Frontend**
  - React 18 with TypeScript
  - Tailwind CSS for styling
  - Framer Motion for animations
  - Privacy-focused user interface
  - Real-time data visualization
  - Mobile-responsive design

- **Backend**
  - Node.js 18 with Express
  - PostgreSQL for data storage
  - Redis for caching
  - End-to-end encryption services
  - Privacy middleware
  - RESTful API with privacy controls

- **Smart Contracts**
  - Stellar Analytics contract (Rust/Soroban)
  - Privacy Oracle contract
  - Privacy budget management
  - Oracle reputation system
  - Cross-network deployment support

- **Infrastructure**
  - Docker containerization
  - Docker Compose orchestration
  - Kubernetes deployment configs
  - Prometheus monitoring
  - Grafana dashboards

- **Developer Experience**
  - Automated setup scripts
  - Comprehensive testing suite
  - TypeScript throughout
  - ESLint and Prettier configuration
  - Pre-commit hooks

- **Documentation**
  - Complete API reference
  - Architecture documentation
  - Deployment guides
  - Contributing guidelines
  - Security policies

### Security
- Military-grade encryption (AES-256-GCM)
- Differential privacy with configurable epsilon
- Zero-knowledge proof architecture
- Privacy budget enforcement
- Comprehensive audit trails
- GDPR and CCPA compliance features

### Performance
- Sub-second analytics responses
- Linear scalability to millions of records
- 5-second blockchain settlement
- Optimized WASM contract execution
- Efficient caching strategies

### Breaking Changes
- None (initial release)

---

## Version History

### Planned Future Releases

#### [1.1.0] - Q2 2024
- Advanced machine learning integration
- Mobile applications (iOS/Android)
- Enterprise SSO integration
- Advanced privacy controls

#### [1.2.0] - Q3 2024
- Cross-chain compatibility
- Advanced reporting suite
- API marketplace
- Enhanced visualization components

#### [2.0.0] - Q4 2024
- Third-party developer platform
- Privacy oracle network
- Governance token implementation
- Global compliance framework

---

## Support

For support, questions, or contributions:
- [GitHub Issues](https://github.com/connect-boiz/stellar-privacy-analytics/issues)
- [Discord Community](https://discord.gg/stellar-privacy-analytics)
- [Email Support](mailto:support@stellar-privacy-analytics.com)

---

**Built with ❤️ by Connect Boiz**
