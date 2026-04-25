//! # Stellar Privacy Analytics
//! 
//! A comprehensive privacy-preserving analytics platform built on Stellar blockchain technology.
//! This crate provides differential privacy mechanisms, secure multi-party computation (SMPC),
//! and zero-knowledge proof systems for privacy-preserving data analysis.
//! 
//! ## Features
//! 
//! - **Differential Privacy**: Configurable epsilon budget management with advanced mechanisms
//! - **Secure Multi-Party Computation**: Privacy-preserving joint data analysis
//! - **Zero-Knowledge Proofs**: Cryptographic proof systems without revealing underlying data
//! - **Prometheus Monitoring**: Comprehensive metrics collection and alerting
//! - **Stellar Integration**: Blockchain-based identity and data provenance
//! - **IPFS/Filecoin Storage**: Decentralized storage with encryption
//! 
//! ## Quick Start
//! 
//! ```rust
//! use stellar_privacy_analytics::monitoring::MonitoringService;
//! 
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = MonitoringConfig::from_env();
//!     let service = MonitoringService::new(config)?;
//!     service.start().await?;
//!     Ok(())
//! }
//! ```
//! 
//! ## Architecture
//! 
//! The system is organized into several key modules:
//! 
//! - **monitoring**: Prometheus metrics collection and alerting
//! - **differential_privacy**: Privacy budget management and noise generation
//! - **smpc**: Secure multi-party computation protocols
//! - **zk_proofs**: Zero-knowledge proof generation and verification
//! - **storage**: IPFS and Filecoin integration
//! - **stellar**: Blockchain integration and identity management

pub mod monitoring;

// Re-export commonly used types and functions
pub use monitoring::{MonitoringService, MonitoringConfig, MetricsCollector};

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!VERSION.is_empty());
    }
}
