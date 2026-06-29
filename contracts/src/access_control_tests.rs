#[cfg(test)]
mod tests {
    use soroban_sdk::{
        testutils::{Address as _, BytesN as _, Ledger},
        Address, BytesN, Env, Symbol, Vec,
    };
    use crate::access_control::{DataSovereigntyAccessControl, DataSovereigntyAccessControlClient, PermissionType};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let stored_admin: Address = env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .get(&Symbol::new(&env, "admin"))
                .unwrap()
        });
        assert_eq!(stored_admin, admin);
    }

    #[test]
    fn test_register_resource() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so is_authorized() returns true
        let owner = admin.clone();
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        // Verify resource was stored
        let has_resource: bool = env.as_contract(&contract_id, || {
            let resources: soroban_sdk::Map<BytesN<32>, crate::access_control::ResourceOwner> = env
                .storage()
                .instance()
                .get(&Symbol::new(&env, "RESOURCE_OWNERS"))
                .unwrap();
            resources.contains_key(resource_id.clone())
        });
        assert!(has_resource);
    }

    #[test]
    fn test_grant_and_revoke_access() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        let ttl: Option<u64> = Some(86400);
        client.grant_access(&owner, &resource_id, &user, &PermissionType::Read, &ttl);

        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);

        client.revoke_access(&owner, &resource_id, &user);

        let has_access_after = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(!has_access_after);
    }

    #[test]
    fn test_access_key_creation() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let holder = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        let mut permissions = Vec::new(&env);
        permissions.push_back(PermissionType::Read);

        let ttl: Option<u64> = Some(86400);
        let key_id = client.create_access_key(&owner, &resource_id, &holder, &permissions, &ttl);

        assert_ne!(key_id, BytesN::<32>::from_array(&env, &[0u8; 32]));
    }

    #[test]
    fn test_permission_hierarchy() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        // Grant write permission
        let no_ttl: Option<u64> = None;
        client.grant_access(&owner, &resource_id, &user, &PermissionType::Write, &no_ttl);

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
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(DataSovereigntyAccessControl, ());
        let client = DataSovereigntyAccessControlClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Use admin as owner so authorization checks pass
        let owner = admin.clone();
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        let signers = Vec::new(&env);
        client.register_resource(&resource_id, &owner, &false, &1u32, &signers);

        // Grant access with 1 second TTL
        let ttl: Option<u64> = Some(1);
        client.grant_access(&owner, &resource_id, &user, &PermissionType::Read, &ttl);

        // Should have access immediately
        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(has_access);

        // Jump forward in time
        env.ledger().set_timestamp(env.ledger().timestamp() + 2);

        // Should not have access after expiration
        let has_access = client.check_access(&user, &resource_id, &PermissionType::Read);
        assert!(!has_access);
    }
}
