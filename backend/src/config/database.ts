import Knex from 'knex';

let db: Knex.Knex | null = null;

export function getDb(): Knex.Knex {
  if (!db) {
    db = Knex({
      client: 'pg',
      connection: process.env.DATABASE_URL || {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'stellar',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      },
      pool: { min: 2, max: 10 },
    });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}
