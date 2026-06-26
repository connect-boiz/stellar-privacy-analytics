#[cfg(test)]
mod tests {
    use crate::access_control::{DataSovereigntyAccessControl, PermissionType};
    use soroban_sdk::{
        testutils::{Address as _, BytesN as _, Ledger},
        Address, BytesN, Env, Symbol, Vec,
    };

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let admin = Address::generate(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap();
        assert_eq!(stored_admin, admin);
    }

    #[test]
    fn test_register_resource() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());

        let result = DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_grant_and_revoke_access() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        let grant_result = DataSovereigntyAccessControl::grant_access(
            env.clone(),
            resource_id.clone(),
            user.clone(),
            PermissionType::Read,
            Some(86400),
        );

        assert!(grant_result.is_ok());

        let has_access = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id.clone(),
            PermissionType::Read,
        )
        .unwrap();

        assert!(has_access);

        let revoke_result =
            DataSovereigntyAccessControl::revoke_access(env.clone(), resource_id, user.clone());

        assert!(revoke_result.is_ok());
    }

    #[test]
    fn test_access_key_creation() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let holder = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        let mut permissions = Vec::new(&env);
        permissions.push_back(PermissionType::Read);

        let key_id = DataSovereigntyAccessControl::create_access_key(
            env.clone(),
            resource_id,
            holder.clone(),
            permissions,
            Some(86400),
        )
        .unwrap();

        assert_ne!(key_id, BytesN::<32>::from_array(&env, &[0u8; 32]));
    }

    #[test]
    fn test_permission_hierarchy() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        // Grant write permission
        DataSovereigntyAccessControl::grant_access(
            env.clone(),
            resource_id.clone(),
            user.clone(),
            PermissionType::Write,
            None,
        )
        .unwrap();

        // Should have read access (write includes read)
        let has_read = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id.clone(),
            PermissionType::Read,
        )
        .unwrap();

        assert!(has_read);

        // Should have write access
        let has_write = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id.clone(),
            PermissionType::Write,
        )
        .unwrap();

        assert!(has_write);

        // Should not have admin access
        let has_admin = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id,
            PermissionType::Admin,
        )
        .unwrap();

        assert!(!has_admin);
    }

    #[test]
    fn test_ttl_expiration() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let user = Address::generate(&env);
        let resource_id = BytesN::<32>::random(&env);

        DataSovereigntyAccessControl::initialize(env.clone(), admin.clone());
        DataSovereigntyAccessControl::register_resource(
            env.clone(),
            resource_id.clone(),
            owner.clone(),
            false,
            1,
            Vec::new(&env),
        );

        // Grant access with 1 second TTL
        DataSovereigntyAccessControl::grant_access(
            env.clone(),
            resource_id.clone(),
            user.clone(),
            PermissionType::Read,
            Some(1),
        )
        .unwrap();

        // Should have access immediately
        let has_access = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id.clone(),
            PermissionType::Read,
        )
        .unwrap();

        assert!(has_access);

        // Jump forward in time
        env.ledger().set_timestamp(env.ledger().timestamp() + 2);

        // Should not have access after expiration
        let has_access = DataSovereigntyAccessControl::check_access(
            env.clone(),
            user.clone(),
            resource_id,
            PermissionType::Read,
        )
        .unwrap();

        assert!(!has_access);
    }
}
