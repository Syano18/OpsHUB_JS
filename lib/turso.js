import { createClient } from '@libsql/client';
import { ensureRuntimeEnv } from '@/lib/runtime-env';

ensureRuntimeEnv();

let cachedClient = null;

export function getTursoClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.TURSO_DATABASE_URL;

  if (!url) {
    throw new Error('TURSO_DATABASE_URL is not configured.');
  }

  cachedClient = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  return cachedClient;
}

export const tursoClient = {
  execute(...args) {
    return getTursoClient().execute(...args);
  },
};
