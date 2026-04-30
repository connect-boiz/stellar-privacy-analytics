import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.string('role').defaultTo('user');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });

  // Analytics table
  await knex.schema.createTable('analyses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('type').notNullable();
    table.string('status').defaultTo('pending');
    table.jsonb('results').nullable();
    table.timestamps(true, true);
  });

  // Privacy settings table
  await knex.schema.createTable('privacy_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').unique();
    table.string('level').defaultTo('high');
    table.integer('data_retention_days').defaultTo(365);
    table.boolean('auto_delete_enabled').defaultTo(false);
    table.boolean('gdpr_compliance_enabled').defaultTo(true);
    table.timestamps(true, true);
  });

  // Audit logs table
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('category').notNullable();
    table.string('action').notNullable();
    table.string('actor_user_id').nullable();
    table.string('actor_ip').nullable();
    table.string('resource_type').nullable();
    table.string('resource_id').nullable();
    table.string('outcome').notNullable();
    table.string('risk_level').defaultTo('low');
    table.jsonb('details').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('privacy_settings');
  await knex.schema.dropTableIfExists('analyses');
  await knex.schema.dropTableIfExists('users');
}
