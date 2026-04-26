use axum::{
    routing::post,
    Json, Router, http::StatusCode, response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;
use ark_serialize::CanonicalDeserialize;
use ark_bls12_381::{Bls12_381, Fr};
use ark_groth16::{Proof, PreparedVerifyingKey, Groth16};
use ark_groth16::prepare_verifying_key;

#[derive(Deserialize)]
struct VerifyRequest {
    proof_bytes: Vec<u8>,
    public_inputs: Vec<u8>,
    dataset_id: String,
    vk_bytes: Vec<u8>, // Typically cached statelessly in production
}

#[derive(Serialize)]
struct VerifyResponse {
    valid: bool,
    timestamp: String,
    dataset_id: String,
    message: String,
}

#[tokio::main]
async fn main() {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(false)
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("Setting default subscriber failed");

    let app = Router::new()
        .route("/verify-range-proof", post(verify_proof_handler));

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("ZK-Proof Verification Engine running on {}", addr);
    
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn verify_proof_handler(
    Json(payload): Json<VerifyRequest>,
) -> impl IntoResponse {
    let start_time = std::time::Instant::now();
    
    // 1. Deserialize the proof
    let proof = match Proof::<Bls12_381>::deserialize_compressed(&*payload.proof_bytes) {
        Ok(p) => p,
        Err(e) => return log_and_respond(false, payload.dataset_id, format!("Invalid proof format: {}", e), start_time),
    };

    // 2. Deserialize public inputs (e.g., bounds for a range proof)
    let inputs: Vec<Fr> = match Vec::<Fr>::deserialize_compressed(&*payload.public_inputs) {
        Ok(i) => i,
        Err(e) => return log_and_respond(false, payload.dataset_id, format!("Invalid public inputs: {}", e), start_time),
    };

    // 3. Deserialize Verification Key
    let vk = match ark_groth16::VerifyingKey::<Bls12_381>::deserialize_compressed(&*payload.vk_bytes) {
        Ok(v) => v,
        Err(e) => return log_and_respond(false, payload.dataset_id, format!("Invalid VK: {}", e), start_time),
    };

    // 4. Verify Range Proof
    let pvk: PreparedVerifyingKey<Bls12_381> = prepare_verifying_key(&vk);
    let is_valid = match Groth16::<Bls12_381>::verify_with_processed_vk(&pvk, &inputs, &proof) {
        Ok(valid) => valid,
        Err(e) => {
            error!("Verification panic/error: {}", e);
            false
        }
    };

    let msg = if is_valid { "Range proof mathematically verified." } else { "Proof rejected: bounds check failed." }.to_string();
    log_and_respond(is_valid, payload.dataset_id, msg, start_time)
}

fn log_and_respond(valid: bool, dataset_id: String, message: String, start_time: std::time::Instant) -> (StatusCode, Json<VerifyResponse>) {
    let elapsed = start_time.elapsed().as_millis();
    let timestamp = chrono::Utc::now().to_rfc3339();
    
    // Secure Audit Trail Logging to stdout (captured by Fluentd/ELK in prod)
    info!(
        "AUDIT_TRAIL | Dataset: {} | Valid: {} | Elapsed: {}ms | Timestamp: {} | Msg: {}",
        dataset_id, valid, elapsed, timestamp, message
    );

    let status = if valid { StatusCode::OK } else { StatusCode::BAD_REQUEST };
    (status, Json(VerifyResponse {
        valid,
        timestamp,
        dataset_id,
        message,
    }))
}