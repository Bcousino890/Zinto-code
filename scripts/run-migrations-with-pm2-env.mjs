#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import {
  dotenvPathForPm2Process,
  environmentForPm2Process,
} from './pm2-migration-environment.mjs';

const command = process.argv[2] ?? 'run';
const scriptForCommand = {
  run: 'db:migrate',
  status: 'db:migrate:status',
  validate: 'db:migrate:validate',
}[command];

if (!scriptForCommand) {
  console.error('Usage: npm run db:migrate:pm2 -- <run|status|validate>');
  process.exitCode = 1;
} else {
  try {
    const pm2Output = execFileSync('pm2', ['jlist'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const processes = JSON.parse(pm2Output);
    const processName = process.env.PM2_APP_NAME ?? 'zinto';
    // PM2 may run `node --require dotenv/config …`, which means its process
    // metadata intentionally does not contain private values from .env. Load
    // the file from the application's own working directory without logging it.
    dotenv.config({ path: dotenvPathForPm2Process(processes, processName), override: false });
    const environment = environmentForPm2Process(processes, processName);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['run', scriptForCommand], {
      env: environment,
      stdio: 'inherit',
    });
    process.exitCode = result.status ?? 1;
  } catch (error) {
    // Do not surface process output: PM2's environment may contain secrets.
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`Unable to run migrations with the PM2 environment: ${message}`);
    process.exitCode = 1;
  }
}
