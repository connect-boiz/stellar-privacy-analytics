# ZK-Proof Verification Engine

A stateless, horizontally scalable microservice for validating zero-knowledge proofs (specifically range proofs) submitted by data providers before they are encrypted and ingested into the Stellar Privacy Analytics platform.

## Cryptographic Primitives Documented for Audit

This service utilizes the `arkworks` ecosystem for highly optimized ZKP verification.

- **Curve**: `BLS12-381` (Pairing-friendly elliptic curve, highly secure and widely audited).
- **Proof System**: `Groth16` (Provides constant-size proofs and fast verification times).
- **Serialization**: Canonical compressed serialization provided by `ark-serialize`.

## Requirements Satisfied

- **Stateless**: No database connections required. All verification keys, inputs, and proofs are passed via the request to allow infinite horizontal scaling.
- **Performance**: Verification time strictly optimized. Native `arkworks` Groth16 verification on BLS12-381 typically evaluates in `~2ms-5ms`, operating well under the `< 200ms` requirement.
- **Secure Audit Trail**: Verification results are securely logged to `stdout` under the `AUDIT_TRAIL` tag, embedding exact timestamps, bounds outcomes, and latencies for tamper-proof log aggregators (e.g., Prometheus/ELK).

## Endpoints

### `POST /verify-range-proof`
Accepts compressed bytes of the Groth16 Proof, Public Inputs (representing upper and lower bounds), and the Verification Key.
Returns a JSON payload with the boolean result and timestamp.

Run with `cargo run --release`.