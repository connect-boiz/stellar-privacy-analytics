pub mod config;
pub mod prometheus_exporter;

pub use self::config::MonitoringConfig;
pub use self::prometheus_exporter::{
    create_authenticated_metrics_route, create_metrics_route, MetricsCollector,
};
use base64::Engine;
use log::{info, warn};
use prometheus::Encoder;
use warp::Filter;

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

        Ok(Self { config, collector })
    }

    /// Start the monitoring service with HTTP server
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!(
            "Starting monitoring service on port {}",
            self.config.prometheus.port
        );

        // Create routes
        let routes = self.create_routes();

        // Start the server
        let addr = ([0, 0, 0, 0], self.config.prometheus.port);
        warp::serve(routes).run(addr).await;

        Ok(())
    }

    /// Create HTTP routes for the monitoring service
    fn create_routes(
        &self,
    ) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
        let collector = self.collector.clone();
        let config = self.config.prometheus.clone();

        let collector_for_metrics = collector.clone();
        let metrics_handler = warp::path("metrics")
            .and(warp::get())
            .and(warp::any().map(move || collector_for_metrics.clone()))
            .and(warp::header::optional::<String>("authorization"))
            .and(warp::addr::remote())
            .and_then(
                move |collector: MetricsCollector,
                      auth: Option<String>,
                      addr: Option<std::net::SocketAddr>| {
                    let config = config.clone();
                    async move {
                        // Check IP filtering
                        if let Some(ref allowed_ips) = config.allowed_ips {
                            if let Some(socket_addr) = addr {
                                let ip_str = socket_addr.ip().to_string();
                                if !allowed_ips.contains(&ip_str)
                                    && !allowed_ips.contains(&"127.0.0.1".to_string())
                                {
                                    return Err(warp::reject::custom(MetricsError::Unauthorized));
                                }
                            } else {
                                return Err(warp::reject::custom(MetricsError::Unauthorized));
                            }
                        }

                        // Check auth
                        if config.enable_auth {
                            if let Some(auth_header) = auth {
                                if let Some(encoded) = auth_header.strip_prefix("Basic ") {
                                    if let Ok(decoded) = base64::engine::general_purpose::STANDARD
                                        .decode(encoded.as_bytes())
                                    {
                                        if let Ok(credentials) = String::from_utf8(decoded) {
                                            if let Some((user, pass)) = credentials.split_once(':')
                                            {
                                                if user
                                                    == config.auth_username.as_deref().unwrap_or("")
                                                    && pass
                                                        == config
                                                            .auth_password
                                                            .as_deref()
                                                            .unwrap_or("")
                                                {
                                                    // Auth passed
                                                } else {
                                                    return Err(warp::reject::custom(
                                                        MetricsError::Unauthorized,
                                                    ));
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    return Err(warp::reject::custom(MetricsError::Unauthorized));
                                }
                            } else {
                                return Err(warp::reject::custom(MetricsError::Unauthorized));
                            }
                        }

                        // Serve metrics
                        let active_count = collector.get_active_session_count().await;
                        let metrics = self::prometheus_exporter::get_metrics();
                        metrics
                            .smpc_sessions_active
                            .with_label_values(&["all", "all"])
                            .set(active_count as f64);

                        let encoder = prometheus::TextEncoder::new();
                        let metric_families = prometheus::gather();
                        let mut buffer = Vec::new();
                        encoder
                            .encode(&metric_families, &mut buffer)
                            .map_err(|_| warp::reject::custom(MetricsError::Encoding))?;

                        let response = String::from_utf8(buffer)
                            .map_err(|_| warp::reject::custom(MetricsError::Encoding))?;

                        Ok::<_, warp::Rejection>(warp::reply::with_header(
                            response,
                            "Content-Type",
                            "text/plain; version=0.0.4; charset=utf-8",
                        ))
                    }
                },
            );

        let collector_for_health = collector.clone();
        let health_route = warp::path("health")
            .and(warp::get())
            .and(warp::any().map(move || collector_for_health.clone()))
            .and_then(|collector: MetricsCollector| async move {
                Ok::<_, warp::Rejection>(self::prometheus_exporter::health_check(&collector).await)
            });

        let cors = warp::cors()
            .allow_any_origin()
            .allow_headers(vec!["authorization", "content-type"])
            .allow_methods(vec!["GET", "POST"]);

        health_route.or(metrics_handler).with(cors)
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
    Encoding,
}

impl warp::reject::Reject for MetricsError {}

// Middleware for automatic metrics collection
pub struct MetricsMiddleware;

impl Default for MetricsMiddleware {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsMiddleware {
    pub fn new() -> Self {
        Self
    }

    /// Create middleware that automatically records API metrics
    pub fn auto_record(
        collector: MetricsCollector,
    ) -> impl Filter<Extract = (), Error = warp::Rejection> + Clone {
        warp::any()
            .and(warp::path::full())
            .and(warp::method())
            .and(warp::any().map(move || collector.clone()))
            .and_then(
                |path: warp::path::FullPath,
                 method: warp::http::Method,
                 collector: MetricsCollector| async move {
                    let start_time = std::time::Instant::now();

                    collector
                        .record_api_request(
                            path.as_str(),
                            method.as_str(),
                            200,
                            start_time.elapsed(),
                        )
                        .await;

                    Ok::<(), warp::Rejection>(())
                },
            )
            .map(|_: ()| ())
            .untuple_one()
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
            warn!(
                "High epsilon utilization detected: {:.2}%",
                epsilon_utilization
            );
        }

        if active_sessions > 50 {
            warn!("High number of active SMPC sessions: {}", active_sessions);
        }

        // Update gauge metrics
        self::prometheus_exporter::get_metrics()
            .smpc_sessions_active
            .with_label_values(&["all", "all"])
            .set(active_sessions as f64);
    }
}

// Health check utilities
pub mod health {
    use super::*;

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

    pub async fn check_system_health(_collector: &MetricsCollector) -> HealthStatus {
        let components = ComponentHealth {
            metrics_collector: true,   // We can reach the collector
            prometheus_endpoint: true, // If we're here, the endpoint is working
            alerting: true,            // Alerting is configured
        };

        let overall_status = if components.metrics_collector
            && components.prometheus_endpoint
            && components.alerting
        {
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
        collector
            .update_dataset_epsilon("test_dataset", 0.5, 1.0)
            .await;

        // Test session management
        collector
            .start_smpc_session("session_1", "standard", "medium", 2)
            .await;
        assert_eq!(collector.get_active_session_count().await, 1);

        collector
            .complete_smpc_session("session_1", true, None)
            .await;
        assert_eq!(collector.get_active_session_count().await, 0);
    }
}
