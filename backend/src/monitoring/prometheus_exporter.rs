use prometheus::{
    register_counter_vec, register_gauge_vec, register_histogram_vec,
    CounterVec, GaugeVec, Histogram, HistogramOpts, HistogramVec, Opts,
};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use warp::{Filter, Reply};

#[derive(Clone, Debug)]
pub struct PrivacyMetrics {
    // Privacy budget tracking
    pub epsilon_consumed_total: CounterVec,
    pub epsilon_budget_remaining: GaugeVec,
    pub epsilon_consumption_rate: Histogram,
    
    // ZK proof metrics
    pub zk_proof_verification_duration: HistogramVec,
    pub zk_proof_generation_duration: HistogramVec,
    pub zk_proofs_verified_total: CounterVec,
    pub zk_proofs_failed_total: CounterVec,
    
    // Storage metrics
    pub ipfs_upload_duration: HistogramVec,
    pub filecoin_upload_duration: HistogramVec,
    pub storage_upload_success_total: CounterVec,
    pub storage_upload_failed_total: CounterVec,
    
    // SMPC session metrics
    pub smpc_sessions_active: GaugeVec,
    pub smpc_sessions_total: CounterVec,
    pub smpc_sessions_completed: CounterVec,
    pub smpc_sessions_failed: CounterVec,
    pub smpc_session_duration: HistogramVec,
    
    // System health metrics
    pub computation_queue_size: GaugeVec,
    pub api_request_duration: HistogramVec,
    pub api_requests_total: CounterVec,
    pub api_errors_total: CounterVec,
}

impl PrivacyMetrics {
    pub fn new() -> Self {
        // Privacy budget metrics
        let epsilon_consumed_total = register_counter_vec!(
            Opts::new("epsilon_consumed_total", "Total epsilon consumed across all datasets"),
            &["dataset_id", "computation_type"]
        ).unwrap();
        
        let epsilon_budget_remaining = register_gauge_vec!(
            Opts::new("epsilon_budget_remaining", "Remaining epsilon budget for datasets"),
            &["dataset_id"]
        ).unwrap();
        
        let epsilon_consumption_rate = register_histogram_vec!(
            HistogramOpts::new("epsilon_consumption_rate", "Rate of epsilon consumption")
                .buckets(vec![0.001, 0.01, 0.1, 0.5, 1.0, 5.0, 10.0]),
            &["dataset_id"]
        ).unwrap();
        
        // ZK proof metrics
        let zk_proof_verification_duration = register_histogram_vec!(
            HistogramOpts::new("zk_proof_verification_duration_seconds", "ZK proof verification duration in seconds")
                .buckets(vec![0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0]),
            &["proof_type", "circuit_size"]
        ).unwrap();
        
        let zk_proof_generation_duration = register_histogram_vec!(
            HistogramOpts::new("zk_proof_generation_duration_seconds", "ZK proof generation duration in seconds")
                .buckets(vec![0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0]),
            &["proof_type", "circuit_size"]
        ).unwrap();
        
        let zk_proofs_verified_total = register_counter_vec!(
            Opts::new("zk_proofs_verified_total", "Total number of ZK proofs verified"),
            &["proof_type", "status"]
        ).unwrap();
        
        let zk_proofs_failed_total = register_counter_vec!(
            Opts::new("zk_proofs_failed_total", "Total number of ZK proof verifications failed"),
            &["proof_type", "error_type"]
        ).unwrap();
        
        // Storage metrics
        let ipfs_upload_duration = register_histogram_vec!(
            HistogramOpts::new("ipfs_upload_duration_seconds", "IPFS upload duration in seconds")
                .buckets(vec![0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]),
            &["file_size_range"]
        ).unwrap();
        
        let filecoin_upload_duration = register_histogram_vec!(
            HistogramOpts::new("filecoin_upload_duration_seconds", "Filecoin upload duration in seconds")
                .buckets(vec![1.0, 5.0, 10.0, 30.0, 60.0, 300.0, 600.0, 1800.0]),
            &["file_size_range", "deal_duration"]
        ).unwrap();
        
        let storage_upload_success_total = register_counter_vec!(
            Opts::new("storage_upload_success_total", "Total successful storage uploads"),
            &["storage_type", "dataset_id"]
        ).unwrap();
        
        let storage_upload_failed_total = register_counter_vec!(
            Opts::new("storage_upload_failed_total", "Total failed storage uploads"),
            &["storage_type", "dataset_id", "error_type"]
        ).unwrap();
        
        // SMPC session metrics
        let smpc_sessions_active = register_gauge_vec!(
            Opts::new("smpc_sessions_active", "Number of active SMPC sessions"),
            &["session_type", "complexity"]
        ).unwrap();
        
        let smpc_sessions_total = register_counter_vec!(
            Opts::new("smpc_sessions_total", "Total number of SMPC sessions initiated"),
            &["session_type", "complexity"]
        ).unwrap();
        
        let smpc_sessions_completed = register_counter_vec!(
            Opts::new("smpc_sessions_completed", "Total number of SMPC sessions completed"),
            &["session_type", "complexity"]
        ).unwrap();
        
        let smpc_sessions_failed = register_counter_vec!(
            Opts::new("smpc_sessions_failed", "Total number of SMPC sessions failed"),
            &["session_type", "complexity", "error_type"]
        ).unwrap();
        
        let smpc_session_duration = register_histogram_vec!(
            HistogramOpts::new("smpc_session_duration_seconds", "SMPC session duration in seconds")
                .buckets(vec![10.0, 30.0, 60.0, 300.0, 600.0, 1800.0, 3600.0, 7200.0]),
            &["session_type", "complexity"]
        ).unwrap();
        
        // System health metrics
        let computation_queue_size = register_gauge_vec!(
            Opts::new("computation_queue_size", "Number of jobs in computation queue"),
            &["queue_type", "priority"]
        ).unwrap();
        
        let api_request_duration = register_histogram_vec!(
            HistogramOpts::new("api_request_duration_seconds", "API request duration in seconds")
                .buckets(vec![0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0]),
            &["endpoint", "method"]
        ).unwrap();
        
        let api_requests_total = register_counter_vec!(
            Opts::new("api_requests_total", "Total number of API requests"),
            &["endpoint", "method", "status_code"]
        ).unwrap();
        
        let api_errors_total = register_counter_vec!(
            Opts::new("api_errors_total", "Total number of API errors"),
            &["endpoint", "error_type"]
        ).unwrap();
        
        Self {
            epsilon_consumed_total,
            epsilon_budget_remaining,
            epsilon_consumption_rate,
            zk_proof_verification_duration,
            zk_proof_generation_duration,
            zk_proofs_verified_total,
            zk_proofs_failed_total,
            ipfs_upload_duration,
            filecoin_upload_duration,
            storage_upload_success_total,
            storage_upload_failed_total,
            smpc_sessions_active,
            smpc_sessions_total,
            smpc_sessions_completed,
            smpc_sessions_failed,
            smpc_session_duration,
            computation_queue_size,
            api_request_duration,
            api_requests_total,
            api_errors_total,
        }
    }
}

// Global metrics instance
static METRICS: std::sync::OnceLock<PrivacyMetrics> = std::sync::OnceLock::new();

pub fn get_metrics() -> &'static PrivacyMetrics {
    METRICS.get_or_init(PrivacyMetrics::new)
}

// Metrics collector for aggregating data from various sources
#[derive(Clone)]
pub struct MetricsCollector {
    datasets: Arc<RwLock<HashMap<String, DatasetMetrics>>>,
    sessions: Arc<RwLock<HashMap<String, SessionMetrics>>>,
}

#[derive(Clone, Debug)]
pub struct DatasetMetrics {
    pub epsilon_budget_total: f64,
    pub epsilon_consumed: f64,
    pub computation_count: u64,
    pub last_computation_time: Option<std::time::Instant>,
}

#[derive(Clone, Debug)]
pub struct SessionMetrics {
    pub session_id: String,
    pub session_type: String,
    pub complexity: String,
    pub start_time: std::time::Instant,
    pub participants: u32,
    pub status: SessionStatus,
}

#[derive(Clone, Debug)]
pub enum SessionStatus {
    Active,
    Completed,
    Failed(String),
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            datasets: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn update_dataset_epsilon(&self, dataset_id: &str, consumed: f64, total: f64) {
        let mut datasets = self.datasets.write().await;
        let metrics = datasets.entry(dataset_id.to_string()).or_insert(DatasetMetrics {
            epsilon_budget_total: total,
            epsilon_consumed: 0.0,
            computation_count: 0,
            last_computation_time: None,
        });
        
        metrics.epsilon_consumed = consumed;
        metrics.epsilon_budget_total = total;
        metrics.last_computation_time = Some(std::time::Instant::now());
        
        // Update Prometheus metrics
        let prom_metrics = get_metrics();
        prom_metrics.epsilon_consumed_total
            .with_label_values(&[dataset_id, "computation"])
            .inc_by(consumed as f64);
        prom_metrics.epsilon_budget_remaining
            .with_label_values(&[dataset_id])
            .set(total - consumed);
    }

    pub async fn record_zk_proof_verification(&self, proof_type: &str, circuit_size: &str, duration: std::time::Duration, success: bool) {
        let prom_metrics = get_metrics();
        prom_metrics.zk_proof_verification_duration
            .with_label_values(&[proof_type, circuit_size])
            .observe(duration.as_secs_f64());
        
        if success {
            prom_metrics.zk_proofs_verified_total
                .with_label_values(&[proof_type, "success"])
                .inc();
        } else {
            prom_metrics.zk_proofs_failed_total
                .with_label_values(&[proof_type, "verification_failed"])
                .inc();
        }
    }

    pub async fn record_storage_upload(&self, storage_type: &str, dataset_id: &str, 
                                     file_size_range: &str, duration: std::time::Duration, success: bool) {
        let prom_metrics = get_metrics();
        
        if storage_type == "ipfs" {
            prom_metrics.ipfs_upload_duration
                .with_label_values(&[file_size_range])
                .observe(duration.as_secs_f64());
        } else if storage_type == "filecoin" {
            prom_metrics.filecoin_upload_duration
                .with_label_values(&[file_size_range, "standard"])
                .observe(duration.as_secs_f64());
        }
        
        if success {
            prom_metrics.storage_upload_success_total
                .with_label_values(&[storage_type, dataset_id])
                .inc();
        } else {
            prom_metrics.storage_upload_failed_total
                .with_label_values(&[storage_type, dataset_id, "upload_error"])
                .inc();
        }
    }

    pub async fn start_smpc_session(&self, session_id: &str, session_type: &str, complexity: &str, participants: u32) {
        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id.to_string(), SessionMetrics {
            session_id: session_id.to_string(),
            session_type: session_type.to_string(),
            complexity: complexity.to_string(),
            start_time: std::time::Instant::now(),
            participants,
            status: SessionStatus::Active,
        });
        
        let prom_metrics = get_metrics();
        prom_metrics.smpc_sessions_total
            .with_label_values(&[session_type, complexity])
            .inc();
        prom_metrics.smpc_sessions_active
            .with_label_values(&[session_type, complexity])
            .inc();
    }

    pub async fn complete_smpc_session(&self, session_id: &str, success: bool, error_type: Option<&str>) {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get(session_id) {
            let duration = session.start_time.elapsed();
            let prom_metrics = get_metrics();
            
            prom_metrics.smpc_session_duration
                .with_label_values(&[&session.session_type, &session.complexity])
                .observe(duration.as_secs_f64());
            
            prom_metrics.smpc_sessions_active
                .with_label_values(&[&session.session_type, &session.complexity])
                .dec();
            
            if success {
                prom_metrics.smpc_sessions_completed
                    .with_label_values(&[&session.session_type, &session.complexity])
                    .inc();
                session.status = SessionStatus::Completed;
            } else {
                let error = error_type.unwrap_or("unknown");
                prom_metrics.smpc_sessions_failed
                    .with_label_values(&[&session.session_type, &session.complexity, error])
                    .inc();
                session.status = SessionStatus::Failed(error.to_string());
            }
        }
    }

    pub async fn get_active_session_count(&self) -> usize {
        let sessions = self.sessions.read().await;
        sessions.values()
            .filter(|s| matches!(s.status, SessionStatus::Active))
            .count()
    }

    pub async fn update_queue_size(&self, queue_type: &str, priority: &str, size: u64) {
        let prom_metrics = get_metrics();
        prom_metrics.computation_queue_size
            .with_label_values(&[queue_type, priority])
            .set(size as f64);
    }

    pub async fn record_api_request(&self, endpoint: &str, method: &str, status_code: u16, duration: std::time::Duration) {
        let prom_metrics = get_metrics();
        prom_metrics.api_request_duration
            .with_label_values(&[endpoint, method])
            .observe(duration.as_secs_f64());
        prom_metrics.api_requests_total
            .with_label_values(&[endpoint, method, &status_code.to_string()])
            .inc();
        
        if status_code >= 400 {
            prom_metrics.api_errors_total
                .with_label_values(&[endpoint, "client_error"])
                .inc();
        }
    }
}

// Metrics HTTP endpoint
pub fn create_metrics_route(collector: MetricsCollector) -> impl Filter<Extract = impl Reply, Error = warp::Rejection> + Clone {
    let collector_clone = collector.clone();
    
    warp::path("metrics")
        .and(warp::get())
        .and(warp::any().map(move || collector_clone.clone()))
        .and_then(|collector: MetricsCollector| async move {
            // Update any real-time metrics before serving
            let active_count = collector.get_active_session_count().await;
            get_metrics().smpc_sessions_active
                .with_label_values(&["all", "all"])
                .set(active_count as f64);
            
            // Gather Prometheus metrics
            let encoder = prometheus::TextEncoder::new();
            let metric_families = prometheus::gather();
            let mut buffer = Vec::new();
            encoder.encode(&metric_families, &mut buffer).map_err(|_| warp::reject::custom(MetricsError::Encoding))?;
            
            Ok::<String, warp::Rejection>(String::from_utf8(buffer).map_err(|_| warp::reject::custom(MetricsError::Encoding))?)
        })
        .map(|response| warp::reply::with_header(response, "Content-Type", "text/plain; version=0.0.4; charset=utf-8"))
}

#[derive(Debug)]
enum MetricsError {
    Encoding,
}

impl warp::reject::Reject for MetricsError {}

pub fn create_authenticated_metrics_route(collector: MetricsCollector, username: &str, password: &str) -> impl Filter<Extract = impl Reply, Error = warp::Rejection> + Clone {
    let auth = warp::header::<String>("authorization")
        .and(warp::any().map(move || (username.to_string(), password.to_string())))
        .and_then(|auth_header: String, (expected_user, expected_pass): (String, String)| async move {
            // Basic authentication: "Basic base64(username:password)"
            if let Some(encoded) = auth_header.strip_prefix("Basic ") {
                match base64::decode(encoded) {
                    Ok(decoded) => {
                        if let Ok(credentials) = String::from_utf8(decoded) {
                            if let Some((user, pass)) = credentials.split_once(':') {
                                if user == expected_user && pass == expected_pass {
                                    return Ok::<(), warp::Rejection>(());
                                }
                            }
                        }
                    }
                    Err(_) => {}
                }
            }
            Err(warp::reject::custom(MetricsError::Unauthorized))
        });
    
    let collector_clone = collector.clone();
    
    auth.and(warp::path("metrics"))
        .and(warp::get())
        .and(warp::any().map(move || collector_clone.clone()))
        .and_then(|collector: MetricsCollector| async move {
            let active_count = collector.get_active_session_count().await;
            get_metrics().smpc_sessions_active
                .with_label_values(&["all", "all"])
                .set(active_count as f64);
            
            let encoder = prometheus::TextEncoder::new();
            let metric_families = prometheus::gather();
            let mut buffer = Vec::new();
            encoder.encode(&metric_families, &mut buffer).map_err(|_| warp::reject::custom(MetricsError::Encoding))?;
            
            Ok::<String, warp::Rejection>(String::from_utf8(buffer).map_err(|_| warp::reject::custom(MetricsError::Encoding))?)
        })
        .map(|response| warp::reply::with_header(response, "Content-Type", "text/plain; version=0.0.4; charset=utf-8"))
}

#[derive(Debug)]
enum MetricsError {
    Encoding,
    Unauthorized,
}

impl warp::reject::Reject for MetricsError {}

// Health check endpoint that also provides basic metrics summary
pub async fn health_check(collector: &MetricsCollector) -> impl Reply {
    let active_sessions = collector.get_active_session_count().await;
    let datasets = collector.datasets.read().await;
    
    let health_status = serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "metrics_summary": {
            "active_smpc_sessions": active_sessions,
            "tracked_datasets": datasets.len(),
            "total_epsilon_consumed": datasets.values().map(|d| d.epsilon_consumed).sum::<f64>(),
            "total_epsilon_budget": datasets.values().map(|d| d.epsilon_budget_total).sum::<f64>()
        }
    });
    
    warp::reply::json(&health_status)
}
