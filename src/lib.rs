#![cfg(test)]

use super::*;
use soroban_sdk::{
    contracterror, contractimpl, vec, Address, BytesN, Env, IntoVal, Map, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The provided proof is invalid or forged.
    InvalidProof = 1,
    /// The proof has already been submitted and verified.
    AlreadyVerified = 2,
    /// The inputs to the function are malformed.
    MalformedInput = 3,
    /// The specified circuit is not recognized.
    UnknownCircuit = 4,
}

pub struct ZkVerificationContract;

#[contractimpl]
impl ZkVerificationContract {
    /// Verifies a zero-knowledge proof (simplified implementation) and stores the result.
    ///
    /// # Arguments
    /// * `provider` - The address of the data provider submitting the proof.
    /// * `user_id` - The address of the user this proof pertains to.
    /// * `circuit_id` - A symbol identifying the type of proof (e.g., `age_gt_18`).
    /// * `public_inputs` - A vector of public values used in the proof.
    /// * `proof` - The proof data, expected to be a SHA256 hash in this simplified model.
    ///
    /// # Panics
    /// If the provider is not authorized.
    ///
    /// # Returns
    /// `Ok(())` on successful verification, or an `Error`.
    ///
    /// # Proof Format Documentation (Simplified for Soroban)
    /// This contract uses a simplified, deterministic "proof" for demonstration.
    /// A real implementation with Groth16/Bulletproofs would require a precompiled contract
    /// or a very gas-intensive verifier, which is currently beyond the scope of a standard
    /// Soroban contract.
    ///
    /// To generate a valid proof for this contract:
    /// 1. Collect the `circuit_id` (as a string/symbol).
    /// 2. Collect the `public_inputs` (as a vector of i128).
    /// 3. Serialize these inputs in a deterministic way. The contract uses `(circuit_id, public_inputs)`.
    /// 4. Compute the SHA256 hash of the serialized data. This 32-byte hash is the `proof`.
    pub fn verify_proof(
        env: Env,
        provider: Address,
        user_id: Address,
        circuit_id: Symbol,
        public_inputs: Vec<i128>,
        proof: BytesN<32>,
    ) -> Result<(), Error> {
        // Authorization: only the provider can submit a proof for themselves.
        // A more complex system might have a registry of authorized providers.
        provider.require_auth();

        // --- ZKP Verification (Simplified) ---
        // In a real ZKP system (Groth16, Bulletproofs), this step would involve
        // complex elliptic curve cryptography operations (pairing checks) using the
        // proof, public inputs, and a verification key stored on-chain.
        //
        // For this implementation, we simulate verification by re-computing a hash.
        // This demonstrates the pattern of proof verification on Soroban.

        // 1. Re-create the data that was hashed to generate the proof.
        let expected_proof_data = (circuit_id.clone(), public_inputs.clone());

        // 2. Hash the data.
        let expected_proof = env.crypto().sha256(&expected_proof_data.into_val(&env));

        // 3. Compare with the provided proof.
        if expected_proof != proof {
            return Err(Error::InvalidProof);
        }

        // --- Map Public Inputs to Contract State ---
        // On successful verification, we store a record indicating that the user
        // has a valid attribute proven by the circuit.

        // We use a nested map: (user_id) -> (circuit_id) -> (public_inputs)
        let mut user_verifications: Map<Symbol, Vec<i128>> = env
            .storage()
            .instance()
            .get(&user_id)
            .unwrap_or_else(|| Map::new(&env));

        // Check if this specific proof has been verified before to prevent replay.
        if user_verifications.has(circuit_id.clone()) {
            return Err(Error::AlreadyVerified);
        }

        // Store the verified data.
        user_verifications.set(circuit_id, public_inputs);
        env.storage().instance().set(&user_id, &user_verifications);
        env.storage().instance().extend_ttl(100, 100);

        Ok(())
    }

    /// Retrieves the verified public inputs for a user and a specific circuit.
    pub fn get_verification(
        env: Env,
        user_id: Address,
        circuit_id: Symbol,
    ) -> Option<Vec<i128>> {
        if let Some(user_verifications) =
            env.storage().instance().get::<_, Map<Symbol, Vec<i128>>>(&user_id)
        {
            user_verifications.get(circuit_id)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, BytesN as _};

    #[test]
    fn test_valid_proof_verification() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, ZkVerificationContract);
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs = vec![&env, 18];

        // Generate the "proof" (hash of circuit_id and public_inputs)
        let proof_data = (circuit_id.clone(), public_inputs.clone());
        let proof = env.crypto().sha256(&proof_data.into_val(&env));

        // Verify the proof
        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &proof);

        // Check that the state was mapped correctly
        let verification = client.get_verification(&user_id, &circuit_id);
        assert_eq!(verification, Some(public_inputs));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")] // InvalidProof
    fn test_invalid_proof() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, ZkVerificationContract);
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs = vec![&env, 18];

        // Generate a forged proof (using wrong data)
        let forged_proof = BytesN::random(&env);

        // Attempt to verify with the forged proof
        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &forged_proof);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")] // InvalidProof
    fn test_mismatched_public_inputs() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, ZkVerificationContract);
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs_for_proof = vec![&env, 18];
        let public_inputs_for_call = vec![&env, 21]; // Mismatched input

        // Proof is generated with correct inputs
        let proof_data = (circuit_id.clone(), public_inputs_for_proof.clone());
        let proof = env.crypto().sha256(&proof_data.into_val(&env));

        // But the call uses different public inputs, which will fail the hash check
        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs_for_call, &proof);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")] // AlreadyVerified
    fn test_replay_attack_prevention() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, ZkVerificationContract);
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs = vec![&env, 18];

        // Generate the proof
        let proof_data = (circuit_id.clone(), public_inputs.clone());
        let proof = env.crypto().sha256(&proof_data.into_val(&env));

        // First verification should succeed
        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &proof);

        // Second verification with the same data should fail
        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &proof);
    }

    #[test]
    fn test_get_verification_for_non_existent_user() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, ZkVerificationContract);
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");

        let verification = client.get_verification(&user_id, &circuit_id);
        assert_eq!(verification, None);
    }
}
