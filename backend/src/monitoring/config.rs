use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrometheusConfig {
    /// Port to serve the metrics endpoint on
    pub port: u16,
    /// Path for the metrics endpoint (default: "/metrics")
    pub metrics_path: String,
    /// Enable authentication for metrics endpoint
    pub enable_auth: bool,
    /// Username for basic authentication (if enabled)
    pub auth_username: Option<String>,
    /// Password for basic authentication (if enabled)
    pub auth_password: Option<String>,
    /// Allowed IP addresses for metrics access (if set, restricts access)
    pub allowed_ips: Option<Vec<String>>,
    /// Metrics collection interval in seconds
    pub collection_interval: u64,
    /// Enable detailed histograms for percentiles
    pub enable_histograms: bool,
    /// Histogram buckets for duration metrics
    pub duration_buckets: Vec<f64>,
    /// Histogram buckets for size metrics
    pub size_buckets: Vec<f64>,
    /// Enable metrics for development/debugging
    pub enable_debug_metrics: bool,
}

impl Default for PrometheusConfig {
    fn default() -> Self {
        Self {
            port: 9090,
            metrics_path: "/metrics".to_string(),
            enable_auth: false,
            auth_username: None,
            auth_password: None,
            allowed_ips: None,
            collection_interval: 15,
            enable_histograms: true,
            duration_buckets: vec![
                0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0, 10000.0
            ],
            size_buckets: vec![
                1024.0, 4096.0, 16384.0, 65536.0, 262144.0, 1048576.0, 4194304.0, 16777216.0, 67108864.0, 268435456.0, 1073741824.0, 4294967296.0
            ],
            enable_debug_metrics: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertingConfig {
    /// Enable alerting rules generation
    pub enable_alerts: bool,
    /// Threshold for high epsilon consumption rate (epsilon per minute)
    pub epsilon_consumption_threshold: f64,
    /// Threshold for high ZK proof verification latency (seconds)
    pub zk_proof_latency_threshold: f64,
    /// Threshold for high storage failure rate (percentage)
    pub storage_failure_threshold: f64,
    /// Threshold for maximum active SMPC sessions
    pub max_active_sessions_threshold: u64,
    /// Threshold for computation queue size
    pub queue_size_threshold: u64,
    /// Alert evaluation interval in seconds
    pub evaluation_interval: u64,
}

impl Default for AlertingConfig {
    fn default() -> Self {
        Self {
            enable_alerts: true,
            epsilon_consumption_threshold: 0.1, // 0.1 epsilon per minute
            zk_proof_latency_threshold: 30.0, // 30 seconds
            storage_failure_threshold: 5.0, // 5% failure rate
            max_active_sessions_threshold: 100,
            queue_size_threshold: 1000,
            evaluation_interval: 60, // 1 minute
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringConfig {
    pub prometheus: PrometheusConfig,
    pub alerting: AlertingConfig,
}

impl Default for MonitoringConfig {
    fn default() -> Self {
        Self {
            prometheus: PrometheusConfig::default(),
            alerting: AlertingConfig::default(),
        }
    }
}

impl MonitoringConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        let mut config = Self::default();
        
        // Prometheus configuration
        if let Ok(port) = std::env::var("PROMETHEUS_PORT") {
            config.prometheus.port = port.parse().unwrap_or(9090);
        }
        
        if let Ok(path) = std::env::var("PROMETHEUS_PATH") {
            config.prometheus.metrics_path = path;
        }
        
        if let Ok(enable_auth) = std::env::var("PROMETHEUS_ENABLE_AUTH") {
            config.prometheus.enable_auth = enable_auth.parse().unwrap_or(false);
        }
        
        if let Ok(username) = std::env::var("PROMETHEUS_AUTH_USERNAME") {
            config.prometheus.auth_username = Some(username);
        }
        
        if let Ok(password) = std::env::var("PROMETHEUS_AUTH_PASSWORD") {
            config.prometheus.auth_password = Some(password);
        }
        
        if let Ok(allowed_ips) = std::env::var("PROMETHEUS_ALLOWED_IPS") {
            config.prometheus.allowed_ips = Some(
                allowed_ips.split(',').map(|s| s.trim().to_string()).collect()
            );
        }
        
        if let Ok(interval) = std::env::var("PROMETHEUS_COLLECTION_INTERVAL") {
            config.prometheus.collection_interval = interval.parse().unwrap_or(15);
        }
        
        // Alerting configuration
        if let Ok(enable_alerts) = std::env::var("MONITORING_ENABLE_ALERTS") {
            config.alerting.enable_alerts = enable_alerts.parse().unwrap_or(true);
        }
        
        if let Ok(epsilon_threshold) = std::env::var("ALERT_EPSILON_THRESHOLD") {
            config.alerting.epsilon_consumption_threshold = epsilon_threshold.parse().unwrap_or(0.1);
        }
        
        if let Ok(zk_threshold) = std::env::var("ALERT_ZK_LATENCY_THRESHOLD") {
            config.alerting.zk_proof_latency_threshold = zk_threshold.parse().unwrap_or(30.0);
        }
        
        if let Ok(storage_threshold) = std::env::var("ALERT_STORAGE_FAILURE_THRESHOLD") {
            config.alerting.storage_failure_threshold = storage_threshold.parse().unwrap_or(5.0);
        }
        
        if let Ok(max_sessions) = std::env::var("ALERT_MAX_SESSIONS_THRESHOLD") {
            config.alerting.max_active_sessions_threshold = max_sessions.parse().unwrap_or(100);
        }
        
        if let Ok(queue_threshold) = std::env::var("ALERT_QUEUE_SIZE_THRESHOLD") {
            config.alerting.queue_size_threshold = queue_threshold.parse().unwrap_or(1000);
        }
        
        config
    }
    
    /// Validate configuration
    pub fn validate(&self) -> Result<(), String> {
        // Validate Prometheus configuration
        if self.prometheus.port == 0 {
            return Err("Invalid Prometheus port".to_string());
        }
        
        if self.prometheus.enable_auth {
            if self.prometheus.auth_username.is_none() || self.prometheus.auth_password.is_none() {
                return Err("Authentication enabled but username or password not provided".to_string());
            }
        }
        
        if self.prometheus.metrics_path.is_empty() {
            return Err("Metrics path cannot be empty".to_string());
        }
        
        // Validate alerting configuration
        if self.alerting.epsilon_consumption_threshold < 0.0 {
            return Err("Epsilon consumption threshold must be non-negative".to_string());
        }
        
        if self.alerting.zk_proof_latency_threshold < 0.0 {
            return Err("ZK proof latency threshold must be non-negative".to_string());
        }
        
        if self.alerting.storage_failure_threshold < 0.0 || self.alerting.storage_failure_threshold > 100.0 {
            return Err("Storage failure threshold must be between 0 and 100".to_string());
        }
        
        Ok(())
    }
    
    /// Generate Prometheus alert rules based on configuration
    pub fn generate_alert_rules(&self) -> String {
        if !self.alerting.enable_alerts {
            return String::new();
        }
        
        format!(
            r#"# Prometheus Alert Rules for Stellar Privacy Analytics
groups:
  - name: privacy_budget_alerts
    rules:
      - alert: HighEpsilonConsumptionRate
        expr: rate(epsilon_consumed_total[5m]) > {}
        for: 2m
        labels:
          severity: warning
          service: stellar-privacy-analytics
        annotations:
          summary: "High epsilon consumption rate detected"
          description: "Epsilon consumption rate is {{{{ $value }}} epsilon per minute, above threshold of {}"
      
      - alert: LowEpsilonBudgetRemaining
        expr: epsilon_budget_remaining < 0.1
        for: 5m
        labels:
          severity: critical
          service: stellar-privacy-analytics
        annotations:
          summary: "Low epsilon budget remaining"
          description: "Dataset {{{{ $labels.dataset_id }}}} has only {{{{ $value }}} epsilon remaining"

  - name: zk_proof_alerts
    rules:
      - alert: HighZKProofVerificationLatency
        expr: histogram_quantile(0.95, rate(zk_proof_verification_duration_seconds_bucket[5m])) > {}
        for: 5m
        labels:
          severity: warning
          service: stellar-privacy-analytics
        annotations:
          summary: "High ZK proof verification latency"
          description: "95th percentile verification latency is {{{{ $value }}}s for {{{{ $labels.proof_type }}}} proofs"
      
      - alert: HighZKProofFailureRate
        expr: rate(zk_proofs_failed_total[5m]) / rate(zk_proofs_verified_total[5m]) > 0.05
        for: 3m
        labels:
          severity: critical
          service: stellar-privacy-analytics
        annotations:
          summary: "High ZK proof failure rate"
          description: "ZK proof failure rate is {{{{ $value | humanizePercentage }}} for {{{{ $labels.proof_type }}}} proofs"

  - name: storage_alerts
    rules:
      - alert: HighStorageFailureRate
        expr: rate(storage_upload_failed_total[5m]) / (rate(storage_upload_success_total[5m]) + rate(storage_upload_failed_total[5m])) > {}
        for: 5m
        labels:
          severity: warning
          service: stellar-privacy-analytics
        annotations:
          summary: "High storage failure rate"
          description: "Storage failure rate is {{{{ $value | humanizePercentage }}} for {{{{ $labels.storage_type }}}} uploads"
      
      - alert: StorageUploadLatencyHigh
        expr: histogram_quantile(0.95, rate(ipfs_upload_duration_seconds_bucket[5m])) > 30
        for: 5m
        labels:
          severity: warning
          service: stellar-privacy-analytics
        annotations:
          summary: "High IPFS upload latency"
          description: "95th percentile IPFS upload latency is {{{{ $value }}}s"

  - name: smpc_alerts
    rules:
      - alert: HighActiveSMPCSessions
        expr: smpc_sessions_active > {}
        for: 3m
        labels:
          severity: warning
          service: stellar-privacy-analytics
        annotations:
          summary: "High number of active SMPC sessions"
          description: "{{{{ $value }}} active SMPC sessions, threshold is {}"
      
      - alert: SMPCSessionFailureRate
        expr: rate(smpc_sessions_failed_total[10m]) / rate(smpc_sessions_total[10m]) > 0.1
        for: 5m
        labels:
          severity: critical
          service: stellar-privacy-analytics
        annotations:
          summary: "High SMPC session failure rate"
          description: "SMPC session failure rate is {{{{ $value | humanizePercentage }}}"

  - name: system_alerts
    rules:
      - alert: ComputationQueueBacklog
        expr: computation_queue_size > {}
        for: 5m
        labels:
          severity: warning
          service: stellar-privacy-analytics
        annotations:
          summary: "Computation queue backlog"
          description: "Queue size is {{{{ $value }}} jobs for {{{{ $labels.queue_type }}}} queue"
      
      - alert: HighAPIErrorRate
        expr: rate(api_errors_total[5m]) / rate(api_requests_total[5m]) > 0.05
        for: 3m
        labels:
          severity: warning
          service: stellar-privacy-analytics
        annotations:
          summary: "High API error rate"
          description: "API error rate is {{{{ $value | humanizePercentage }}} for {{{{ $labels.endpoint }}}"}
"#,
            self.alerting.epsilon_consumption_threshold,
            self.alerting.epsilon_consumption_threshold,
            self.alerting.zk_proof_latency_threshold,
            self.alerting.storage_failure_threshold / 100.0,
            self.alerting.max_active_sessions_threshold,
            self.alerting.queue_size_threshold
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_config() {
        let config = MonitoringConfig::default();
        assert_eq!(config.prometheus.port, 9090);
        assert_eq!(config.prometheus.metrics_path, "/metrics");
        assert!(!config.prometheus.enable_auth);
        assert!(config.alerting.enable_alerts);
    }
    
    #[test]
    fn test_config_validation() {
        let mut config = MonitoringConfig::default();
        assert!(config.validate().is_ok());
        
        // Test invalid port
        config.prometheus.port = 0;
        assert!(config.validate().is_err());
        
        // Test auth without credentials
        config.prometheus.port = 9090;
        config.prometheus.enable_auth = true;
        assert!(config.validate().is_err());
        
        // Test auth with credentials
        config.prometheus.auth_username = Some("user".to_string());
        config.prometheus.auth_password = Some("pass".to_string());
        assert!(config.validate().is_ok());
    }
    
    #[test]
    fn test_alert_rules_generation() {
        let config = MonitoringConfig::default();
        let rules = config.generate_alert_rules();
        assert!(rules.contains("HighEpsilonConsumptionRate"));
        assert!(rules.contains("HighZKProofVerificationLatency"));
        assert!(rules.contains("HighStorageFailureRate"));
        assert!(rules.contains("HighActiveSMPCSessions"));
    }
}
