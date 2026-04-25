# Stellar Privacy Analytics - Prometheus Exporter

A comprehensive Prometheus metrics exporter for monitoring system-wide health of the Stellar Privacy Analytics platform, with focus on privacy budget usage, ZK proof verification times, and active SMPC sessions.

## Features

### 📊 **Comprehensive Metrics Coverage**
- **Privacy Budget Monitoring**: Track epsilon consumption rates and remaining budget across all datasets
- **ZK Proof Performance**: Precise latency histograms with P95/P99 percentiles
- **Storage Upload Monitoring**: IPFS and Filecoin upload success/failure rates and latency
- **SMPC Session Tracking**: Active session counts, completion rates, and duration metrics
- **System Health**: API request rates, error rates, and queue sizes

### 🔒 **Security Features**
- **Basic Authentication**: Secure the metrics endpoint with username/password
- **IP Whitelisting**: Restrict access to specific IP addresses
- **CORS Support**: Configurable cross-origin resource sharing
- **Internal Network Ready**: Designed for deployment in trusted networks

### 📈 **Alerting & Visualization**
- **Prometheus Alert Rules**: Pre-configured alerting for threshold-based monitoring
- **Grafana Dashboard**: Ready-to-import dashboard with all key metrics
- **Health Check Endpoint**: System health status with aggregated metrics summary

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/stellar-privacy-analytics.git
cd stellar-privacy-analytics/backend

# Build the monitoring service
cargo build --release --bin monitoring_service

# Generate configuration files
cargo run --bin monitoring_service config --output-dir ./monitoring

# Start the monitoring service
cargo run --release --bin monitoring_service start
```

### Configuration

The monitoring service can be configured via environment variables or configuration files:

```bash
# Environment variables
export PROMETHEUS_PORT=9090
export PROMETHEUS_ENABLE_AUTH=true
export PROMETHEUS_AUTH_USERNAME=monitoring
export PROMETHEUS_AUTH_PASSWORD=secure_password
export MONITORING_ENABLE_ALERTS=true
```

Or create a `monitoring-config.toml` file:

```toml
[prometheus]
port = 9090
metrics_path = "/metrics"
enable_auth = true
auth_username = "monitoring"
auth_password = "secure_password"
collection_interval = 15

[alerting]
enable_alerts = true
epsilon_consumption_threshold = 0.1
zk_proof_latency_threshold = 30.0
storage_failure_threshold = 5.0
max_active_sessions_threshold = 100
```

### CLI Usage

```bash
# Start with custom port
cargo run --bin monitoring_service start --port 8080

# Start with authentication
cargo run --bin monitoring_service start --auth --username admin --password secret

# Generate alert rules and dashboard
cargo run --bin monitoring_service start --generate-alerts --generate-dashboard

# Generate all configuration files
cargo run --bin monitoring_service config --output-dir ./monitoring
```

## Metrics Reference

### Privacy Budget Metrics

| Metric | Description | Labels |
|--------|-------------|--------|
| `epsilon_consumed_total` | Total epsilon consumed | `dataset_id`, `computation_type` |
| `epsilon_budget_remaining` | Remaining epsilon budget | `dataset_id` |
| `epsilon_consumption_rate` | Rate of epsilon consumption | `dataset_id` |

### ZK Proof Metrics

| Metric | Description | Labels |
|--------|-------------|--------|
| `zk_proof_verification_duration_seconds` | Verification latency histogram | `proof_type`, `circuit_size` |
| `zk_proof_generation_duration_seconds` | Generation latency histogram | `proof_type`, `circuit_size` |
| `zk_proofs_verified_total` | Total proofs verified | `proof_type`, `status` |
| `zk_proofs_failed_total` | Total proof failures | `proof_type`, `error_type` |

### Storage Metrics

| Metric | Description | Labels |
|--------|-------------|--------|
| `ipfs_upload_duration_seconds` | IPFS upload latency histogram | `file_size_range` |
| `filecoin_upload_duration_seconds` | Filecoin upload latency histogram | `file_size_range`, `deal_duration` |
| `storage_upload_success_total` | Successful uploads | `storage_type`, `dataset_id` |
| `storage_upload_failed_total` | Failed uploads | `storage_type`, `dataset_id`, `error_type` |

### SMPC Session Metrics

| Metric | Description | Labels |
|--------|-------------|--------|
| `smpc_sessions_active` | Currently active sessions | `session_type`, `complexity` |
| `smpc_sessions_total` | Total sessions initiated | `session_type`, `complexity` |
| `smpc_sessions_completed` | Total sessions completed | `session_type`, `complexity` |
| `smpc_sessions_failed_total` | Total sessions failed | `session_type`, `complexity`, `error_type` |
| `smpc_session_duration_seconds` | Session duration histogram | `session_type`, `complexity` |

### System Health Metrics

| Metric | Description | Labels |
|--------|-------------|--------|
| `computation_queue_size` | Jobs in computation queue | `queue_type`, `priority` |
| `api_request_duration_seconds` | API request latency histogram | `endpoint`, `method` |
| `api_requests_total` | Total API requests | `endpoint`, `method`, `status_code` |
| `api_errors_total` | Total API errors | `endpoint`, `error_type` |

## Alerting Rules

The monitoring service generates Prometheus alert rules for the following conditions:

### Privacy Budget Alerts
- **High Epsilon Consumption Rate**: When consumption exceeds 0.1 epsilon/minute
- **Low Epsilon Budget Remaining**: When remaining budget drops below 0.1 epsilon

### ZK Proof Alerts
- **High Verification Latency**: When P95 latency exceeds 30 seconds
- **High Failure Rate**: When failure rate exceeds 5%

### Storage Alerts
- **High Failure Rate**: When failure rate exceeds 5%
- **High Upload Latency**: When P95 IPFS latency exceeds 30 seconds

### SMPC Alerts
- **High Active Sessions**: When active sessions exceed 100
- **High Session Failure Rate**: When failure rate exceeds 10%

### System Alerts
- **Queue Backlog**: When queue size exceeds 1000 jobs
- **High API Error Rate**: When error rate exceeds 5%

## Grafana Dashboard

A pre-configured Grafana dashboard is included with the following panels:

1. **Privacy Budget Overview**
   - Remaining epsilon budget by dataset
   - Epsilon consumption rate over time

2. **ZK Proof Performance**
   - Verification latency percentiles (P50, P95, P99)
   - Success/failure rates by proof type

3. **Storage Monitoring**
   - Upload failure rates
   - Latency percentiles for IPFS/Filecoin

4. **SMPC Session Tracking**
   - Active session counts
   - Session completion rates and durations

5. **System Health**
   - API request rates and error rates
   - Computation queue sizes

### Importing the Dashboard

1. Navigate to Grafana
2. Go to **Dashboard → Import**
3. Upload the `monitoring/grafana-dashboard.json` file
4. Configure the Prometheus data source to point to `http://localhost:9090/metrics`

## API Endpoints

### Metrics Endpoint
```
GET /metrics
```
Returns Prometheus-formatted metrics for scraping.

**Authentication**: Optional (if enabled in configuration)

**Response**:
```
# HELP epsilon_consumed_total
# TYPE epsilon_consumed_total counter
epsilon_consumed_total{dataset_id="dataset1",computation_type="computation"} 123.45
```

### Health Check Endpoint
```
GET /health
```

Returns system health status with aggregated metrics summary.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-03-25T09:23:00Z",
  "version": "0.1.0",
  "uptime_seconds": 3600,
  "metrics_summary": {
    "active_smpc_sessions": 5,
    "tracked_datasets": 12,
    "total_epsilon_consumed": 2.5,
    "total_epsilon_budget": 10.0
  }
}
```

## Integration Examples

### Using the Metrics Collector

```rust
use stellar_privacy_analytics::monitoring::MetricsCollector;

#[tokio::main]
async fn main() {
    let collector = MetricsCollector::new();
    
    // Record a ZK proof verification
    collector.record_zk_proof_verification(
        "groth16", 
        "large", 
        std::time::Duration::from_secs(25), 
        true
    ).await;
    
    // Update dataset epsilon usage
    collector.update_dataset_epsilon(
        "dataset_1", 
        0.5, 
        1.0
    ).await;
    
    // Start an SMPC session
    collector.start_smpc_session(
        "session_123", 
        "standard", 
        "medium", 
        3
    ).await;
}
```

### Starting the Monitoring Service

```rust
use stellar_privacy_analytics::monitoring::{MonitoringService, MonitoringConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = MonitoringConfig::from_env();
    let service = MonitoringService::new(config)?;
    service.start().await?;
    Ok(())
}
```

## Security Considerations

### Authentication
- Enable basic authentication for production deployments
- Use strong passwords and rotate them regularly
- Consider using external authentication providers for enterprise deployments

### Network Security
- Restrict access to the metrics endpoint using IP whitelisting
- Deploy the monitoring service in a trusted network zone
- Use TLS/HTTPS for external access

### Data Privacy
- The metrics collector does not store sensitive data
- Epsilon values are aggregated and not linked to individual users
- Consider data retention policies for metrics storage

## Troubleshooting

### Common Issues

**Q: Metrics endpoint returns 404**
A: Check that the monitoring service is running and the port is correct.

**Q: Authentication fails**
A: Verify that authentication is enabled and credentials are correct.

**Q: No data appears in Grafana**
A: Ensure Prometheus is configured to scrape the metrics endpoint and the service is running.

**Q: Alert rules don't work**
A: Check that the alert rules file is correctly configured in Prometheus.

### Debug Mode

Enable debug metrics for additional visibility:

```bash
cargo run --bin monitoring_service start --debug
```

This enables additional metrics for development and debugging.

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/your-org/stellar-privacy-analytics.git
cd stellar-privacy-analytics/backend

# Install dependencies
cargo build

# Run tests
cargo test

# Run with debug logging
RUST_LOG=debug cargo run --bin monitoring_service start
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new metrics
5. Submit a pull request

### Adding New Metrics

1. Add the metric definition in `prometheus_exporter.rs`
2. Update the collector to record the metric
3. Add the metric to the Grafana dashboard
4. Update alert rules if necessary
5. Add tests for the new metric

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the troubleshooting section above
