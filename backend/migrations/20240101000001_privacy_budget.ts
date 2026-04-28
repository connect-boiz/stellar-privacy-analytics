import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('privacy_budgets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.float('epsilon').notNullable().defaultTo(1.0);
    table.float('delta').notNullable().defaultTo(1e-5);
    table.float('consumed_epsilon').defaultTo(0);
    table.float('consumed_delta').defaultTo(0);
    table.timestamp('reset_at').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('privacy_budget_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('budget_id').references('id').inTable('privacy_budgets').onDelete('CASCADE');
    table.float('epsilon_used').notNullable();
    table.float('delta_used').notNullable();
    table.string('operation').notNullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('privacy_budget_transactions');
  await knex.schema.dropTableIfExists('privacy_budgets');
}
