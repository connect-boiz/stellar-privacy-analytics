import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add index on analyses.user_id for faster user-scoped queries
  await knex.schema.table('analyses', (table) => {
    table.index(['user_id'], 'idx_analyses_user_id');
    table.index(['status'], 'idx_analyses_status');
    table.index(['created_at'], 'idx_analyses_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('analyses', (table) => {
    table.dropIndex(['user_id'], 'idx_analyses_user_id');
    table.dropIndex(['status'], 'idx_analyses_status');
    table.dropIndex(['created_at'], 'idx_analyses_created_at');
  });
}
