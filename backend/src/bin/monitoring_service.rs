use clap::{Parser, Subcommand};
use log::{info, error};
use std::env;
use stellar_privacy_analytics::monitoring::{MonitoringService, MonitoringConfig};

#[derive(Parser)]
#[command(name = "stellar-monitoring")]
#[command(about = "Stellar Privacy Analytics Monitoring Service")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the monitoring service
    Start {
        /// Port to serve metrics on (default: 9090)
        #[arg(short, long, default_value = "9090")]
        port: u16,
        
        /// Enable authentication for metrics endpoint
        #[arg(long)]
        auth: bool,
        
        /// Username for basic authentication
        #[arg(long, requires = "auth")]
        username: Option<String>,
        
        /// Password for basic authentication
        #[arg(long, requires = "auth")]
        password: Option<String>,
        
        /// Comma-separated list of allowed IP addresses
        #[arg(long)]
        allowed_ips: Option<String>,
        
        /// Metrics collection interval in seconds (default: 15)
        #[arg(short, long, default_value = "15")]
        interval: u64,
        
        /// Enable debug metrics
        #[arg(long)]
        debug: bool,
        
        /// Generate alert rules file
        #[arg(long)]
        generate_alerts: bool,
        
        /// Generate Grafana dashboard file
        #[arg(long)]
        generate_dashboard: bool,
    },
    
    /// Generate configuration files
    Config {
        /// Output directory for generated files
        #[arg(short, long, default_value = "./monitoring")]
        output_dir: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    
    let cli = Cli::parse();
    
    match cli.command {
        Commands::Start { 
            port, 
            auth, 
            username, 
            password, 
            allowed_ips, 
            interval, 
            debug, 
            generate_alerts, 
            generate_dashboard 
        } => {
            // Create monitoring configuration
            let mut config = MonitoringConfig::default();
            config.prometheus.port = port;
            config.prometheus.enable_auth = auth;
            config.prometheus.auth_username = username;
            config.prometheus.auth_password = password;
            config.prometheus.collection_interval = interval;
            config.prometheus.enable_debug_metrics = debug;
            
            if let Some(ips) = allowed_ips {
                config.prometheus.allowed_ips = Some(
                    ips.split(',').map(|s| s.trim().to_string()).collect()
                );
            }
            
            // Validate configuration
            config.validate().map_err(|e| {
                error!("Configuration validation failed: {}", e);
                e
            })?;
            
            // Generate alert rules if requested
            if generate_alerts {
                let alert_rules = config.generate_alert_rules();
                let alert_file = "./monitoring/alert-rules.yml";
                std::fs::write(alert_file, alert_rules)?;
                info!("Alert rules generated: {}", alert_file);
            }
            
            // Generate Grafana dashboard if requested
            if generate_dashboard {
                let dashboard_content = include_str!("../monitoring/grafana-dashboard.json");
                let dashboard_file = "./monitoring/grafana-dashboard.json";
                std::fs::write(dashboard_file, dashboard_content)?;
                info!("Grafana dashboard generated: {}", dashboard_file);
            }
            
            // Create and start monitoring service
            let service = MonitoringService::new(config)
                .map_err(|e| {
                    error!("Failed to create monitoring service: {}", e);
                    e
                })?;
            
            info!("Starting Stellar Privacy Analytics Monitoring Service");
            info!("Metrics endpoint: http://localhost:{}/metrics", port);
            
            if service.get_config().prometheus.enable_auth {
                info!("Authentication enabled for metrics endpoint");
            }
            
            service.start().await?;
        }
        
        Commands::Config { output_dir } => {
            // Create output directory
            std::fs::create_dir_all(&output_dir, true)?;
            
            // Generate default configuration
            let config = MonitoringConfig::default();
            let config_file = format!("{}/monitoring-config.toml", output_dir);
            let config_toml = toml::to_string_pretty(&config)?;
            std::fs::write(config_file, config_toml)?;
            info!("Configuration file generated: {}", config_file);
            
            // Generate alert rules
            let alert_rules = config.generate_alert_rules();
            let alert_file = format!("{}/alert-rules.yml", output_dir);
            std::fs::write(alert_file, alert_rules)?;
            info!("Alert rules generated: {}", alert_file);
            
            // Generate Grafana dashboard
            let dashboard_content = include_str!("../monitoring/grafana-dashboard.json");
            let dashboard_file = format!("{}/grafana-dashboard.json", output_dir);
            std::fs::write(dashboard_file, dashboard_content)?;
            info!("Grafana dashboard generated: {}", dashboard_file);
            
            // Generate environment file template
            let env_file = format!("{}/.env.example", output_dir);
            let env_content = r#"# Stellar Privacy Analytics Monitoring Configuration

# Prometheus Configuration
PROMETHEUS_PORT=9090
PROMETHEUS_PATH=/metrics
PROMETHEUS_COLLECTION_INTERVAL=15

# Authentication (optional)
# PROMETHEUS_ENABLE_AUTH=true
# PROMETHEUS_AUTH_USERNAME=monitoring
# PROMETHEUS_AUTH_PASSWORD=secure_password

# IP Restrictions (optional)
# PROMETHEUS_ALLOWED_IPS=127.0.0.1,10.0.0.0/8

# Alerting Configuration
MONITORING_ENABLE_ALERTS=true
ALERT_EPSILON_THRESHOLD=0.1
ALERT_ZK_LATENCY_THRESHOLD=30.0
ALERT_STORAGE_FAILURE_THRESHOLD=5.0
ALERT_MAX_SESSIONS_THRESHOLD=100
ALERT_QUEUE_SIZE_THRESHOLD=1000
"#;
            std::fs::write(env_file, env_content)?;
            info!("Environment file template generated: {}", env_file);
            
            info!("All configuration files generated in: {}", output_dir);
        }
    }
    
    Ok(())
}
