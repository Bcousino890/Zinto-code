import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dotenvPathForPm2Process,
  environmentForPm2Process,
} from '../scripts/pm2-migration-environment.mjs';

test('uses the named PM2 process environment without exposing or altering it', () => {
  const environment = environmentForPm2Process([
    {
      name: 'other-service',
      pm2_env: { env: { DATABASE_URL: 'postgres://other' } },
    },
    {
      name: 'zinto',
      pm2_env: {
        env: {
          DATABASE_URL: 'postgres://production',
          SESSION_SECRET: 'not-logged',
          NODE_ENV: 'production',
        },
      },
    },
  ], 'zinto', { PATH: '/usr/bin', DATABASE_URL: 'postgres://caller' });

  assert.equal(environment.DATABASE_URL, 'postgres://production');
  assert.equal(environment.SESSION_SECRET, 'not-logged');
  assert.equal(environment.NODE_ENV, 'production');
  assert.equal(environment.PATH, '/usr/bin');
});

test('fails closed when the PM2 process is absent', () => {
  assert.throws(
    () => environmentForPm2Process([], 'zinto', {}),
    /PM2 process "zinto" was not found/,
  );
});

test('keeps the caller environment when PM2 loads configuration from dotenv at startup', () => {
  assert.deepEqual(
    environmentForPm2Process([{ name: 'zinto', pm2_env: {} }], 'zinto', {
      DATABASE_URL: 'postgres://dotenv-loaded',
      SESSION_SECRET: 'dotenv-secret',
    }),
    {
      DATABASE_URL: 'postgres://dotenv-loaded',
      SESSION_SECRET: 'dotenv-secret',
    },
  );
});

test('loads dotenv from PM2 working directory instead of the SSH caller directory', () => {
  assert.equal(
    dotenvPathForPm2Process([{ name: 'zinto', pm2_env: { pm_cwd: '/srv/zinto' } }], 'zinto'),
    '/srv/zinto/.env',
  );
});
