#![cfg_attr(not(test), no_std)]

pub mod data_sovereignty;
pub mod laplace_noise;

use soroban_sdk::{
    contract, contracterror, contractimpl, Address, Bytes, BytesN, Env, Map, Symbol, Vec,
};

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

fn proof_payload(env: &Env, public_inputs: &Vec<i128>) -> Bytes {
    let mut payload = Bytes::new(env);
    for input in public_inputs.iter() {
        payload.append(&Bytes::from_slice(env, &input.to_be_bytes()));
    }
    payload
}

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

        let expected_proof = env.crypto().sha256(&proof_payload(&env, &public_inputs));

        if expected_proof != proof {
            return Err(Error::InvalidProof);
        }

        let mut user_verifications: Map<Symbol, Vec<i128>> = env
            .storage()
            .instance()
            .get(&user_id)
            .unwrap_or_else(|| Map::new(&env));

        if user_verifications.contains_key(circuit_id.clone()) {
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
    use soroban_sdk::vec;

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

        let proof = env.crypto().sha256(&proof_payload(&env, &public_inputs));

        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &proof);

        let verification = client.get_verification(&user_id, &circuit_id);
        assert_eq!(verification, Some(public_inputs));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_invalid_proof() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, ZkVerificationContract);
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs = vec![&env, 18];
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

        let contract_id = env.register_contract(None, ZkVerificationContract);
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs_for_proof = vec![&env, 18];
        let public_inputs_for_call = vec![&env, 21];

        let proof = env
            .crypto()
            .sha256(&proof_payload(&env, &public_inputs_for_proof));

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

        let contract_id = env.register_contract(None, ZkVerificationContract);
        let client = ZkVerificationContractClient::new(&env, &contract_id);

        let provider = Address::generate(&env);
        let user_id = Address::generate(&env);
        let circuit_id = Symbol::new(&env, "age_gt_18");
        let public_inputs = vec![&env, 18];

        let proof = env.crypto().sha256(&proof_payload(&env, &public_inputs));

        client.verify_proof(&provider, &user_id, &circuit_id, &public_inputs, &proof);
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
