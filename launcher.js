#!/usr/bin/env node
/**
 * Launcher for Kalinga OpsHub
 * Starts the Next.js server and automatically opens the browser to localhost:3000
 */

const { spawn } = require('child_process');
const { execSync } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const MAX_RETRIES = 30;
const RETRY_DELAY = 500;

function isServerReady() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, (res) => {
      req.destroy();
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(retries = 0) {
  if (retries > MAX_RETRIES) {
    console.error('Failed to connect to server after maximum retries.');
    return false;
  }

  const ready = await isServerReady();
  if (ready) {
    return true;
  }

  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
  return waitForServer(retries + 1);
}

function openBrowser() {
  const isWin = process.platform === 'win32';
  const isOsx = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';

  try {
    if (isWin) {
      execSync(`start ${BASE_URL}`, { shell: true, stdio: 'ignore' });
    } else if (isOsx) {
      execSync(`open ${BASE_URL}`, { stdio: 'ignore' });
    } else if (isLinux) {
      execSync(`xdg-open ${BASE_URL}`, { stdio: 'ignore' });
    }
    console.log(`✓ Opened browser to ${BASE_URL}`);
  } catch (err) {
    console.warn(`Could not automatically open browser. Visit ${BASE_URL} manually.`);
  }
}

async function main() {
  console.log('🚀 Starting Kalinga OpsHub...\n');

  // Start the Next.js server
  const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  // Wait for server to be ready, then open browser
  console.log('⏳ Waiting for server to start...');
  const ready = await waitForServer();

  if (ready) {
    openBrowser();
  } else {
    console.warn(`Visit ${BASE_URL} manually if the browser does not open.`);
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n📛 Shutting down...');
    serverProcess.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Launcher error:', err);
  process.exit(1);
});
