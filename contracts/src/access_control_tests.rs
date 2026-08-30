#[cfg(test)]
mod tests {
    use crate::access_control::DataSovereigntyAccessControlClient;
    use crate::access_control::PermissionType;
    use crate::*;
    use soroban_sdk::testutils::{Address as _, BytesN as _, Ledger as _};
    use soroban_sdk::{Address, BytesN, Env, Symbol, Vec};

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract = env.register_contract(None, DataSovereigntyAccessControl);
        let client = DataSovereigntyAccessControlClient::new(&env, &contract).mock_all_auths();
        client.initialize_access_control(&admin);
        (env, admin, contract)
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract = env.register_contract(None, DataSovereigntyAccessControl);
        let client = DataSovereigntyAccessControlClient::new(&env, &contract).mock_all_auths();
        client.initialize_access_control(&admin);

        let stored_admin: Address = env.as_contract(&contract, || {
            env.storage()
                .instance()
                .get(&Symbol::new(&env, "admin"))
                .unwrap()
        });
        assert_eq!(stored_admin, admin);
    }

    #[test]
    fn test_register_resource() {
        let (env, _admin, contract) = setup();
        let owner = Address::generate(&env);
        let resource_id = BytesN::random(&env);

        let client = DataSovereigntyAccessControlClient::new(&env, &contract).mock_all_auths();
        client.register_resource(&resource_id, &owner, &false, &1, &Vec::new(&env));
    }

    #[test]
    fn test_grant_and_revoke_access() {
        let (env, _admin, contract) = setup();
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::random(&env);

        let client = DataSovereigntyAccessControlClient::new(&env, &contract).mock_all_auths();
        client.register_resource(&resource_id, &owner, &false, &1, &Vec::new(&env));

        client.grant_access(&resource_id, &user, &PermissionType::Read, &Some(86400));

        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);

        client.revoke_access(&resource_id, &user);

        let has_access_after = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(!has_access_after);
    }

    #[test]
    fn test_access_key_creation() {
        let (env, _admin, contract) = setup();
        let owner = Address::generate(&env);
        let holder = Address::generate(&env);
        let resource_id = BytesN::random(&env);

        let client = DataSovereigntyAccessControlClient::new(&env, &contract).mock_all_auths();
        client.register_resource(&resource_id, &owner, &false, &1, &Vec::new(&env));

        let mut permissions = Vec::new(&env);
        permissions.push_back(PermissionType::Read);

        let key_id = client.create_access_key(&resource_id, &holder, &permissions, &Some(86400));

        assert_ne!(key_id, BytesN::from_array(&env, &[0u8; 32]));
    }

    #[test]
    fn test_permission_hierarchy() {
        let (env, _admin, contract) = setup();
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::random(&env);

        let client = DataSovereigntyAccessControlClient::new(&env, &contract).mock_all_auths();
        client.register_resource(&resource_id, &owner, &false, &1, &Vec::new(&env));

        // Grant write permission
        client.grant_access(&resource_id, &user, &PermissionType::Write, &None);

        // Should have read access (write includes read)
        let has_read = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_read);

        // Should have write access
        let has_write = client.check_access(&user, &resource_id, &PermissionType::Write);
        assert!(has_write);

        // Should not have admin access
        let has_admin = client.check_access(&user, &resource_id, &PermissionType::Admin);
        assert!(!has_admin);
    }

    #[test]
    fn test_ttl_expiration() {
        let (env, _admin, contract) = setup();
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::random(&env);

        let client = DataSovereigntyAccessControlClient::new(&env, &contract).mock_all_auths();
        client.register_resource(&resource_id, &owner, &false, &1, &Vec::new(&env));

        // Grant access with 1 second TTL
        client.grant_access(&resource_id, &user, &PermissionType::Read, &Some(1));

        // Should have access immediately
        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);

        // Jump forward in time
        let new_ts = env.ledger().timestamp() + 2;
        env.ledger().with_mut(|l| l.timestamp = new_ts);

        // Should not have access after expiration
        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(!has_access);
    }
}
