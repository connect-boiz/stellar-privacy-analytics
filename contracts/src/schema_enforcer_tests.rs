#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Symbol, Vec};

    use crate::schema_enforcer::{SchemaEnforcer, SchemaEnforcerClient, SchemaField};

    fn setup(env: &Env) -> SchemaEnforcerClient<'_> {
        let contract_id = env.register(SchemaEnforcer, ());
        SchemaEnforcerClient::new(env, &contract_id)
    }

    /// Create a schema with the given name; empty field/metadata sets keep the
    /// tests focused on the org-index bookkeeping rather than field validation.
    fn create_named_schema(
        env: &Env,
        client: &SchemaEnforcerClient,
        org_id: &Address,
        name: &str,
    ) -> BytesN<32> {
        let fields: Vec<SchemaField> = Vec::new(env);
        let required_metadata: Vec<String> = Vec::new(env);
        client.create_schema(
            org_id,
            &String::from_str(env, name),
            &String::from_str(env, "v1"),
            &fields,
            &required_metadata,
        )
    }

    #[test]
    fn test_created_schema_appears_in_org_index() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let org_id = Address::generate(&env);
        let schema_id = create_named_schema(&env, &client, &org_id, "schema_0");

        let org_schemas = client.get_org_schemas(&org_id);
        assert_eq!(org_schemas.len(), 1);
        assert_eq!(org_schemas.get(0).unwrap(), schema_id);
    }

    /// Acceptance criterion: create 5 schemas, deactivate 3,
    /// get_org_schemas returns 2.
    #[test]
    fn test_deactivate_removes_from_org_schemas_index() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let org_id = Address::generate(&env);

        let schema_ids = [
            create_named_schema(&env, &client, &org_id, "schema_0"),
            create_named_schema(&env, &client, &org_id, "schema_1"),
            create_named_schema(&env, &client, &org_id, "schema_2"),
            create_named_schema(&env, &client, &org_id, "schema_3"),
            create_named_schema(&env, &client, &org_id, "schema_4"),
        ];

        assert_eq!(client.get_org_schemas(&org_id).len(), 5);

        // Deactivate the first three schemas.
        client.deactivate_schema(&schema_ids[0], &org_id);
        client.deactivate_schema(&schema_ids[1], &org_id);
        client.deactivate_schema(&schema_ids[2], &org_id);

        let remaining = client.get_org_schemas(&org_id);
        assert_eq!(remaining.len(), 2);

        // The two survivors are exactly the schemas that were never deactivated.
        assert!(remaining.iter().any(|id| id == schema_ids[3]));
        assert!(remaining.iter().any(|id| id == schema_ids[4]));

        // None of the deactivated schemas remain in the org index.
        assert!(!remaining.iter().any(|id| id == schema_ids[0]));
        assert!(!remaining.iter().any(|id| id == schema_ids[1]));
        assert!(!remaining.iter().any(|id| id == schema_ids[2]));
    }

    #[test]
    fn test_deactivate_removes_from_active_schemas_index() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let org_id = Address::generate(&env);
        let schema_id = create_named_schema(&env, &client, &org_id, "schema_0");

        let contract_id = client.address.clone();
        let active_before: Vec<BytesN<32>> = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get(&Symbol::new(&env, "active_schemas"))
                .unwrap_or_else(|| Vec::new(&env))
        });
        assert!(active_before.iter().any(|id| id == schema_id));

        client.deactivate_schema(&schema_id, &org_id);

        let active_after: Vec<BytesN<32>> = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get(&Symbol::new(&env, "active_schemas"))
                .unwrap_or_else(|| Vec::new(&env))
        });
        assert!(!active_after.iter().any(|id| id == schema_id));
    }

    /// Deactivating one org's schema must not touch another org's index.
    #[test]
    fn test_deactivate_is_scoped_to_owning_org() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let org_a = Address::generate(&env);
        let org_b = Address::generate(&env);

        let a_schema = create_named_schema(&env, &client, &org_a, "a_schema");
        let b_schema = create_named_schema(&env, &client, &org_b, "b_schema");

        client.deactivate_schema(&a_schema, &org_a);

        assert_eq!(client.get_org_schemas(&org_a).len(), 0);

        let org_b_schemas = client.get_org_schemas(&org_b);
        assert_eq!(org_b_schemas.len(), 1);
        assert_eq!(org_b_schemas.get(0).unwrap(), b_schema);
    }

    /// The schema record itself is retained (marked inactive); only the indexes
    /// are pruned. Re-running deactivation is a harmless no-op on the index.
    #[test]
    fn test_deactivate_is_idempotent_on_index() {
        let env = Env::default();
        env.mock_all_auths();
        let client = setup(&env);

        let org_id = Address::generate(&env);
        let keep = create_named_schema(&env, &client, &org_id, "keep");
        let drop = create_named_schema(&env, &client, &org_id, "drop");

        client.deactivate_schema(&drop, &org_id);
        client.deactivate_schema(&drop, &org_id); // second call must not corrupt the index

        let remaining = client.get_org_schemas(&org_id);
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining.get(0).unwrap(), keep);

        // The deactivated schema is still retrievable, now flagged inactive.
        let details = client.get_schema_details(&drop);
        assert!(!details.is_active);
    }
}
