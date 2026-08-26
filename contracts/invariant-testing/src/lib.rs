//! Internal invariant-checking library (issue #412, Workstream 5).
//!
//! This module intentionally declares **no** `#[contractimpl]` block, so it
//! exposes no externally-invocable entry points: an external user cannot call
//! any of these checks (previously every `test_*` function was a public
//! contract entry point, so an attacker could invoke the "invariant tests"
//! themselves, which proved nothing and consumed gas).
//!
//! The checks are instead called internally by the audited contracts after
//! state mutations (see each contract's `verify_state` helper) and fail
//! closed: a violated invariant aborts the transaction with
//! `InvariantTestingError::InvariantViolation`.
//!
//! All arithmetic helpers use checked operations so a violation is detected
//! instead of silently wrapping (the old `test_integer_overflow_invariant`
//! only compared `value > max_value`, which cannot detect actual overflow,
//! and `simulate_sybil_attack` multiplied unchecked, so overflow could defeat
//! the very check it pretended to enforce).

#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::contracterror;
use soroban_sdk::contracttype;
use soroban_sdk::Env;
use soroban_sdk::String;

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct InvariantViolation {
    pub invariant_name: String,
    pub description: String,
    pub severity: Severity,
    pub timestamp: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum Severity {
    Critical = 0,
    High = 1,
    Medium = 2,
    Low = 3,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[contracterror]
#[repr(u32)]
pub enum InvariantTestingError {
    InvariantViolation = 0,
    TestFailed = 1,
    InvalidInput = 2,
}

/// Emits an `invariant_violation` event and returns the fail-closed error.
fn raise(env: &Env, name: &str, description: &str, severity: Severity) -> InvariantTestingError {
    env.events().publish(
        (
            soroban_sdk::Symbol::new(env, "invariant_violation"),
            String::from_str(env, name),
        ),
        (
            String::from_str(env, description),
            severity,
            env.ledger().timestamp(),
        ),
    );
    InvariantTestingError::InvariantViolation
}

/// Verifies a value is strictly positive (e.g. noise, fees, deposits).
pub fn check_positive(env: &Env, value: i128, name: &str) -> Result<(), InvariantTestingError> {
    if value <= 0 {
        return Err(raise(
            env,
            name,
            "Value must always be greater than 0",
            Severity::Critical,
        ));
    }
    Ok(())
}

/// Checked addition — fails closed on overflow instead of wrapping.
pub fn check_checked_add(
    env: &Env,
    a: i128,
    b: i128,
    name: &str,
) -> Result<i128, InvariantTestingError> {
    a.checked_add(b).ok_or_else(|| {
        raise(
            env,
            name,
            "Addition overflowed; state left untouched (fail-closed)",
            Severity::Critical,
        )
    })
}

/// Checked subtraction — fails closed on underflow instead of wrapping.
pub fn check_checked_sub(
    env: &Env,
    a: i128,
    b: i128,
    name: &str,
) -> Result<i128, InvariantTestingError> {
    a.checked_sub(b).ok_or_else(|| {
        raise(
            env,
            name,
            "Subtraction underflowed; state left untouched (fail-closed)",
            Severity::Critical,
        )
    })
}

/// Checked multiplication — fails closed on overflow instead of wrapping.
pub fn check_checked_mul(
    env: &Env,
    a: i128,
    b: i128,
    name: &str,
) -> Result<i128, InvariantTestingError> {
    a.checked_mul(b).ok_or_else(|| {
        raise(
            env,
            name,
            "Multiplication overflowed; state left untouched (fail-closed)",
            Severity::Critical,
        )
    })
}

/// Verifies `used <= budget` (the differential-privacy budget invariant).
pub fn check_budget_not_exceeded(
    env: &Env,
    budget: i128,
    used: i128,
    name: &str,
) -> Result<(), InvariantTestingError> {
    if used > budget {
        return Err(raise(
            env,
            name,
            "Used privacy budget cannot exceed the request's total budget",
            Severity::High,
        ));
    }
    Ok(())
}

/// Verifies a stored counter matches the value recomputed from the underlying
/// ledgers (`expected`). `description` names the invariant being checked.
pub fn check_counter_consistent(
    env: &Env,
    stored: i128,
    recomputed: i128,
    name: &str,
    description: &str,
) -> Result<(), InvariantTestingError> {
    if stored != recomputed {
        return Err(raise(env, name, description, Severity::Critical));
    }
    Ok(())
}

/// Sybil-resistance estimate computed with checked multiplication so the check
/// itself cannot be defeated by overflow (previously the unchecked product
/// could wrap below `max_allowed_budget` and pass).
pub fn simulate_sybil_attack(
    env: &Env,
    attacker_count: u32,
    budget_per_attacker: i128,
    max_allowed_budget: i128,
) -> Result<bool, InvariantTestingError> {
    let total_attack_budget = check_checked_mul(
        env,
        budget_per_attacker,
        attacker_count as i128,
        "sybil_resistance",
    )?;
    Ok(total_attack_budget > max_allowed_budget)
}

#[cfg(test)]
mod tests;
