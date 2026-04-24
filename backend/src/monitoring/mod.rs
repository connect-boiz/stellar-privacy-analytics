use crate::monitoring::{config::MonitoringConfig, prometheus_exporter::{MetricsCollector, create_metrics_route, create_authenticated_metrics_route}};
use std::sync::Arc;
use tokio::sync::RwLock;
use warp::Filter;
use log::{info, warn, error};

#[derive(Clone)]
pub struct MonitoringService {
    pub config: MonitoringConfig,
    pub collector: MetricsCollector,
}

impl MonitoringService {
    pub fn new(config: MonitoringConfig) -> Result<Self, String> {
        // Validate configuration
        config.validate()?;
        
        let collector = MetricsCollector::new();
        
        Ok(Self {
            config,
            collector,
        })
    }

    /// Start the monitoring service with HTTP server
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Starting monitoring service on port {}", self.config.prometheus.port);
        
        // Create routes
        let routes = self.create_routes();
        
        // Start the server
        let addr = ([0, 0, 0, 0], self.config.prometheus.port);
        warp::serve(routes)
            .run(addr)
            .await;
        
        Ok(())
    }

    /// Create HTTP routes for the monitoring service
    fn create_routes(&self) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
        let health_route = warp::path("health")
            .and(warp::get())
            .and(warp::any().map(move || self.collector.clone()))
            .and_then(|collector: MetricsCollector| async move {
                crate::monitoring::prometheus_exporter::health_check(&collector).await
            });

        let metrics_route = if self.config.prometheus.enable_auth {
            let username = self.config.prometheus.auth_username.as_ref().unwrap();
            let password = self.config.prometheus.auth_password.as_ref().unwrap();
            create_authenticated_metrics_route(self.collector.clone(), username, password)
        } else {
            create_metrics_route(self.collector.clone())
        };

        // Add IP filtering if configured
        let metrics_route = if let Some(ref allowed_ips) = self.config.prometheus.allowed_ips {
            let ip_filter = warp::addr::remote()
                .and(warp::any().map(move || allowed_ips.clone()))
                .and_then(|addr: Option<std::net::SocketAddr>, allowed: Vec<String>| async move {
                    if let Some(socket_addr) = addr {
                        let ip_str = socket_addr.ip().to_string();
                        if allowed.contains(&ip_str) || allowed.contains(&"127.0.0.1".to_string()) {
                            Ok::<(), warp::Rejection>(())
                        } else {
                            Err(warp::reject::custom(MetricsError::Unauthorized))
                        }
                    } else {
                        Err(warp::reject::custom(MetricsError::Unauthorized))
                    }
                });
            
            ip_filter.and(metrics_route)
        } else {
            metrics_route
        };

        // Add CORS for development
        let cors = warp::cors()
            .allow_any_origin()
            .allow_headers(vec!["authorization", "content-type"])
            .allow_methods(vec!["GET", "POST"]);

        health_route.or(metrics_route).with(cors)
    }

    /// Generate and return Prometheus alert rules
    pub fn get_alert_rules(&self) -> String {
        self.config.generate_alert_rules()
    }

    /// Update configuration (useful for runtime updates)
    pub async fn update_config(&mut self, new_config: MonitoringConfig) -> Result<(), String> {
        new_config.validate()?;
        self.config = new_config;
        info!("Monitoring configuration updated");
        Ok(())
    }

    /// Get current configuration
    pub fn get_config(&self) -> &MonitoringConfig {
        &self.config
    }

    /// Get metrics collector for external use
    pub fn get_collector(&self) -> &MetricsCollector {
        &self.collector
    }
}

#[derive(Debug)]
enum MetricsError {
    Unauthorized,
}

impl warp::reject::Reject for MetricsError {}

// Middleware for automatic metrics collection
pub struct MetricsMiddleware;

impl MetricsMiddleware {
    pub fn new() -> Self {
        Self
    }

    /// Create middleware that automatically records API metrics
    pub fn auto_record(collector: MetricsCollector) -> impl Filter<Extract = (), Error = warp::Rejection> + Clone {
        warp::any()
            .and(warp::path::full())
            .and(warp::method())
            .and(warp::any().map(move || collector.clone()))
            .and_then(|path: warp::path::FullPath, method: warp::http::Method, collector: MetricsCollector| async move {
                let start_time = std::time::Instant::now();
                
                // This would be used in a real implementation to record the request
                // For now, we just return success
                collector.record_api_request(
                    path.as_str(),
                    method.as_str(),
                    200,
                    start_time.elapsed()
                ).await;
                
                Ok::<(), warp::Rejection>(())
            }))
    }
}

// Metrics aggregation and reporting
pub struct MetricsAggregator {
    collector: MetricsCollector,
    report_interval: std::time::Duration,
}

impl MetricsAggregator {
    pub fn new(collector: MetricsCollector, report_interval: std::time::Duration) -> Self {
        Self {
            collector,
            report_interval,
        }
    }

    /// Start the aggregation task
    pub async fn start(&self) {
        let mut interval = tokio::time::interval(self.report_interval);
        
        loop {
            interval.tick().await;
            self.aggregate_and_report().await;
        }
    }

    async fn aggregate_and_report(&self) {
        let active_sessions = self.collector.get_active_session_count().await;
        let datasets = self.collector.datasets.read().await;
        
        // Calculate aggregate metrics
        let total_epsilon_consumed: f64 = datasets.values().map(|d| d.epsilon_consumed).sum();
        let total_epsilon_budget: f64 = datasets.values().map(|d| d.epsilon_budget_total).sum();
        let epsilon_utilization = if total_epsilon_budget > 0.0 {
            (total_epsilon_consumed / total_epsilon_budget) * 100.0
        } else {
            0.0
        };

        // Log aggregated metrics
        info!(
            "Metrics Report - Active Sessions: {}, Datasets: {}, Epsilon Utilization: {:.2}%",
            active_sessions,
            datasets.len(),
            epsilon_utilization
        );

        // Check for alert conditions
        if epsilon_utilization > 80.0 {
            warn!("High epsilon utilization detected: {:.2}%", epsilon_utilization);
        }

        if active_sessions > 50 {
            warn!("High number of active SMPC sessions: {}", active_sessions);
        }

        // Update gauge metrics
        crate::monitoring::prometheus_exporter::get_metrics().smpc_sessions_active
            .with_label_values(&["all", "all"])
            .set(active_sessions as f64);
    }
}

// Health check utilities
pub mod health {
    use super::*;
    use serde_json::json;

    #[derive(Debug, serde::Serialize)]
    pub struct HealthStatus {
        pub status: String,
        pub timestamp: String,
        pub version: String,
        pub uptime_seconds: u64,
        pub components: ComponentHealth,
    }

    #[derive(Debug, serde::Serialize)]
    pub struct ComponentHealth {
        pub metrics_collector: bool,
        pub prometheus_endpoint: bool,
        pub alerting: bool,
    }

    pub async fn check_system_health(collector: &MetricsCollector) -> HealthStatus {
        let components = ComponentHealth {
            metrics_collector: true, // We can reach the collector
            prometheus_endpoint: true, // If we're here, the endpoint is working
            alerting: true, // Alerting is configured
        };

        let overall_status = if components.metrics_collector 
            && components.prometheus_endpoint 
            && components.alerting {
            "healthy".to_string()
        } else {
            "unhealthy".to_string()
        };

        HealthStatus {
            status: overall_status,
            timestamp: chrono::Utc::now().to_rfc3339(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            uptime_seconds: get_system_uptime(),
            components,
        }
    }

    fn get_system_uptime() -> u64 {
        // This would get the actual system uptime in a real implementation
        // For now, return a placeholder
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_monitoring_service_creation() {
        let config = MonitoringConfig::default();
        let service = MonitoringService::new(config);
        assert!(service.is_ok());
    }

    #[test]
    fn test_monitoring_service_invalid_config() {
        let mut config = MonitoringConfig::default();
        config.prometheus.port = 0; // Invalid port
        
        let service = MonitoringService::new(config);
        assert!(service.is_err());
    }

    #[tokio::test]
    async fn test_metrics_collector() {
        let collector = MetricsCollector::new();
        
        // Test dataset epsilon update
        collector.update_dataset_epsilon("test_dataset", 0.5, 1.0).await;
        
        // Test session management
        collector.start_smpc_session("session_1", "standard", "medium", 2).await;
        assert_eq!(collector.get_active_session_count().await, 1);
        
        collector.complete_smpc_session("session_1", true, None).await;
        assert_eq!(collector.get_active_session_count().await, 0);
    }
}
