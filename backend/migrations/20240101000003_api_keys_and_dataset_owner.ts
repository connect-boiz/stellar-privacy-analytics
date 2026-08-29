import type { Knex } from "knex";

/**
 * WS1 (issue #413) — service-to-service API keys.
 *
 * Stores only SHA-256 digests of raw keys so the plaintext key is never
 * persisted. Permissions are stored as a text array; rate_limit_tier and
 * organization_id scope the key; is_active / expires_at enforce lifecycle.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("api_keys", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key_hash", 64).notNullable().unique();
    table.string("name").notNullable();
    table.specificType("permissions", "text[]").notNullable().defaultTo("{read:queries}");
    table
      .enu("rate_limit_tier", ["basic", "premium", "enterprise"])
      .notNullable()
      .defaultTo("basic");
    table.uuid("organization_id").nullable();
    table.string("email").nullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("expires_at").nullable();
    table.timestamps(true, true);
  });

  await knex.schema.alterTable("datasets", (table) => {
    table.uuid("owner_id").nullable();
    table.string("content_hash", 64).nullable();
    table.index("owner_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("datasets", (table) => {
    table.dropColumn("content_hash");
    table.dropColumn("owner_id");
  });
  await knex.schema.dropTableIfExists("api_keys");
}
