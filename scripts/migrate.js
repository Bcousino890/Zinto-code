#!/usr/bin/env node
/**
 * CLI wrapper for the MigrationSystem.
 * Usage:
 *   node scripts/migrate.js run
 *   node scripts/migrate.js status
 *   node scripts/migrate.js validate
 *   node scripts/migrate.js create <name>
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const command = process.argv[2] || 'run';
const rest = process.argv.slice(3);
const cliPath = path.join(__dirname, 'migrate-cli.ts');

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', cliPath, command, ...rest],
  {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: process.env,
    shell: process.platform === 'win32',
  },
);

process.exit(result.status == null ? 1 : result.status);
