import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

let hasLoadedRuntimeEnv = false;

function getCandidateEnvDirs() {
  const cwd = process.cwd();

  return [
    cwd,
    path.resolve(cwd, '..'),
    path.resolve(cwd, '..', '..'),
  ];
}

export function ensureRuntimeEnv() {
  if (hasLoadedRuntimeEnv) {
    return;
  }

  hasLoadedRuntimeEnv = true;

  for (const dir of getCandidateEnvDirs()) {
    for (const fileName of ['.env', '.env.local']) {
      const fullPath = path.join(dir, fileName);

      if (!fs.existsSync(fullPath)) {
        continue;
      }

      dotenv.config({
        path: fullPath,
        override: false,
      });
    }
  }
}
