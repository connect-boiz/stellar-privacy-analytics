#![no_std]
#![allow(unexpected_cfgs)]

pub mod data_sovereignty;
pub mod laplace_noise;

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{contract, contracterror, contractimpl, Address, BytesN, Env, Map, Symbol, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidProof = 1,
    AlreadyVerified = 2,
    MalformedInput = 3,
    UnknownCircuit = 4,
}

#[contract]
pub struct ZkVerificationContract;

#[contractimpl]
impl ZkVerificationContract {
    pub fn verify_proof(
        env: Env,
        provider: Address,
        user_id: Address,
        circuit_id: Symbol,
        public_inputs: Vec<i128>,
        proof: BytesN<32>,
    ) -> Result<(), Error> {
        provider.require_auth();

        let expected_proof_data = (circuit_id.clone(), public_inputs.clone());
        let expected_proof = env.crypto().sha256(&expected_proof_data.to_xdr(&env));

        if expected_proof.to_array() != proof.to_array() {
            return Err(Error::InvalidProof);
        }

        let mut user_verifications: Map<Symbol, Vec<i128>> = env
            .storage()
            .instance()
            .get(&user_id)
            .unwrap_or_else(|| Map::new(&env));

        if user_verifications.get(circuit_id.clone()).is_some() {
            return Err(Error::AlreadyVerified);
        }

        user_verifications.set(circuit_id, public_inputs);
        env.storage().instance().set(&user_id, &user_verifications);
        env.storage().instance().extend_ttl(100, 100);

        Ok(())
    }

    pub fn get_verification(env: Env, user_id: Address, circuit_id: Symbol) -> Option<Vec<i128>> {
        if let Some(user_verifications) = env
            .storage()
            .instance()
            .get::<_, Map<Symbol, Vec<i128>>>(&user_id)
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

        let contract_id = env.register(ZkVerificationContract, ());
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs = soroban_sdk::vec![&env, 18];

        let proof_data = (circuit_id.clone(), public_inputs.clone());
        let proof_hash = env.crypto().sha256(&proof_data.to_xdr(&env));
        let proof = BytesN::from_array(&env, &proof_hash.to_array());

        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &proof);

        let verification = client.get_verification(&user_id, &circuit_id);
        assert_eq!(verification, Some(public_inputs));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_invalid_proof() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(ZkVerificationContract, ());
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs = soroban_sdk::vec![&env, 18];
        let forged_proof = BytesN::random(&env);

        client.verify_proof(
            &provider,
            &user_id,
            &circuit_id,
            &public_inputs,
            &forged_proof,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_mismatched_public_inputs() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(ZkVerificationContract, ());
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs_for_proof = soroban_sdk::vec![&env, 18];
        let public_inputs_for_call = soroban_sdk::vec![&env, 21];

        let proof_data = (circuit_id.clone(), public_inputs_for_proof.clone());
        let proof_hash = env.crypto().sha256(&proof_data.to_xdr(&env));
        let proof = BytesN::from_array(&env, &proof_hash.to_array());

        client.verify_proof(
            &provider,
            &user_id,
            &circuit_id,
            &public_inputs_for_call,
            &proof,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_replay_attack_prevention() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(ZkVerificationContract, ());
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs = soroban_sdk::vec![&env, 18];

        let proof_data = (circuit_id.clone(), public_inputs.clone());
        let proof_hash = env.crypto().sha256(&proof_data.to_xdr(&env));
        let proof = BytesN::from_array(&env, &proof_hash.to_array());

        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &proof);
        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &proof);
    }

    #[test]
    fn test_get_verification_for_non_existent_user() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(ZkVerificationContract, ());
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");

        let verification = client.get_verification(&user_id, &circuit_id);
        assert_eq!(verification, None);
    }
}
