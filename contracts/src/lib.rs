#![no_std]

#[cfg(not(target_family = "wasm"))]
pub mod access_control;
#[cfg(not(target_family = "wasm"))]
pub mod admin;
#[cfg(not(target_family = "wasm"))]
pub mod invariant_testing;
#[cfg(not(target_family = "wasm"))]
pub mod onchain_aggregator;
#[cfg(not(target_family = "wasm"))]
pub mod privacy_oracle;
#[cfg(not(target_family = "wasm"))]
pub mod schema_enforcer;
pub mod stellar_analytics;
#[cfg(not(target_family = "wasm"))]
pub mod ttl_storage;
#[cfg(not(target_family = "wasm"))]
pub mod upgradeable_proxy;

#[cfg(test)]
mod access_control_tests;
#[cfg(test)]
mod initialize_auth_tests;
#[cfg(test)]
mod invariant_testing_tests;
#[cfg(test)]
mod onchain_aggregator_tests;

#[cfg(not(target_family = "wasm"))]
pub use access_control::DataSovereigntyAccessControl;
#[cfg(not(target_family = "wasm"))]
pub use admin::MultiSigAdmin;
#[cfg(not(target_family = "wasm"))]
pub use invariant_testing::InvariantTesting;
#[cfg(not(target_family = "wasm"))]
pub use onchain_aggregator::OnChainAggregator;
#[cfg(not(target_family = "wasm"))]
pub use privacy_oracle::PrivacyOracle;
#[cfg(not(target_family = "wasm"))]
pub use schema_enforcer::SchemaEnforcer;
pub use stellar_analytics::StellarAnalytics;
#[cfg(not(target_family = "wasm"))]
pub use ttl_storage::TtlStorage;
#[cfg(not(target_family = "wasm"))]
pub use upgradeable_proxy::UpgradeableProxy;
