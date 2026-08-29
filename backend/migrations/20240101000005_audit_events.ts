import type { Knex } from "knex";

/**
 * WS5 (issue #413) — durable, append-only audit store.
 *
 * The JSONL file remains as a derived export; this table is the canonical
 * tamper-evident record. Every row carries the hash-chain linkage
 * (prev_hash + record_hash) and an HMAC signature so verifyIntegrity can
 * detect tampering, deletion, or reordering even after process restarts.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("audit_events", (table) => {
    table.string("id").primary();
    table.timestamp("timestamp").notNullable().defaultTo(knex.fn.now());
    table.string("category").notNullable();
    table.string("action").notNullable();
    table.string("outcome").notNullable();
    table.jsonb("actor").nullable();
    table.jsonb("resource").nullable();
    table.jsonb("details").nullable();
    table.string("prev_hash").nullable();
    table.string("record_hash").nullable();
    table.string("signature").nullable();
    table.double("privacy_budget_consumed").nullable();
    table.string("risk_level").nullable();
    table.index("timestamp");
    table.index("category");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_events");
}
