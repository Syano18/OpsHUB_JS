import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { createClient } from '@libsql/client';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function run() {
  try {
    await client.execute('ALTER TABLE personal ADD COLUMN end_date TEXT');
    console.log('Migration successful');
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('Column already exists');
    } else {
      console.error('Migration failed:', error.message);
    }
  }
}

run();