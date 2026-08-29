import type { Knex } from "knex";

/**
 * WS2 (issue #413) — durable key-material metadata persistence.
 * Only wrapped/ciphertext blobs are stored; plaintext never touches the DB.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("master_keys", (table) => {
    table.string("key_id").primary();
    table.integer("version").notNullable();
    table.string("algorithm").notNullable();
    table
      .enu("status", ["active", "deprecated", "revoked"])
      .notNullable()
      .defaultTo("active");
    table.integer("usage_count").notNullable().defaultTo(0);
    table.integer("max_usage").notNullable().defaultTo(1000000);
    table.jsonb("wrapped_blob").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("wrapped_keys", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key_id").notNullable();
    table.integer("version").notNullable();
    table.string("algorithm").notNullable();
    table.text("ciphertext").notNullable();
    table.text("iv").notNullable();
    table.text("tag").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.unique(["key_id", "version"]);
  });

  /**
   * WS4 — append-only ledger of privacy-budget consumption so spends are
   * auditable and the check-then-spend race is eliminated at the DB level.
   */
  await knex.schema.createTable("budget_transactions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("budget_id").notNullable();
    table.float("amount").notNullable();
    table.string("operation").notNullable();
    table.string("description").nullable();
    table.uuid("user_id").notNullable();
    table.timestamp("timestamp").defaultTo(knex.fn.now());
    table.index("budget_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("budget_transactions");
  await knex.schema.dropTableIfExists("wrapped_keys");
  await knex.schema.dropTableIfExists("master_keys");
}
