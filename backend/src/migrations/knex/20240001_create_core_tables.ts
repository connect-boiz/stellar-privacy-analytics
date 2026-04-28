import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Analyses table
  await knex.schema.createTableIfNotExists('analyses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('status').notNullable().defaultTo('pending');
    table.string('type').notNullable();
    table.jsonb('results').defaultTo('{}');
    table.timestamps(true, true);
  });

  // Datasets table
  await knex.schema.createTableIfNotExists('datasets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.boolean('encrypted').defaultTo(true);
    table.bigInteger('size').defaultTo(0);
    table.string('mime_type');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });

  // Audit logs table
  await knex.schema.createTableIfNotExists('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('action').notNullable();
    table.string('resource_type').notNullable();
    table.string('user_id');
    table.string('ip_address');
    table.jsonb('details').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Privacy budgets table
  await knex.schema.createTableIfNotExists('privacy_budgets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('user_id').notNullable();
    table.float('total_budget').notNullable().defaultTo(1.0);
    table.float('used_budget').notNullable().defaultTo(0.0);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('privacy_budgets');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('datasets');
  await knex.schema.dropTableIfExists('analyses');
}
