//! Cross-contract integration tests for the Soroban contract suite.
//!
//! - `auth_regression_tests`: Workstream 1 spoofing regression coverage — every
//!   mutating entry point enforces host-level auth (`Address::require_auth`).
//! - `initialize_auth_tests`: initialization cannot be front-run — `initialize`
//!   requires the supplied admin to authorize the call.

#[cfg(test)]
mod auth_regression_tests;
#[cfg(test)]
mod initialize_auth_tests;
