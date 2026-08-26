#!/usr/bin/env tsx
import 'dotenv/config';
import { migrationSystem } from '../server/migration-system';
import { pool } from '../server/db';

async function main() {
  const command = process.argv[2] || 'run';

  try {
    await migrationSystem.ensureMigrationsTable();

    if (command === 'run') {
      console.log('Running pending migrations…');
      await migrationSystem.runPendingMigrations();
      const status = await migrationSystem.getMigrationStatus();
      console.log(`Done. Executed=${status.executed.length} pending=${status.pending.length} failed=${status.failed.length}`);
      if (status.pending.length) {
        console.error('Pending migrations remain:', status.pending);
        process.exitCode = 1;
      }
      const dentalFailed = status.failed.filter((f) => /dental/i.test(f));
      if (dentalFailed.length) {
        console.error('Failed dental migrations:', dentalFailed);
        process.exitCode = 1;
      }
    } else if (command === 'status') {
      const status = await migrationSystem.getMigrationStatus();
      console.log('Executed:');
      status.executed.forEach((f) => console.log(`  ✓ ${f}`));
      console.log('Pending:');
      status.pending.forEach((f) => console.log(`  · ${f}`));
      console.log('Failed:');
      status.failed.forEach((f) => console.log(`  ✗ ${f}`));
    } else if (command === 'validate') {
      const ok = await migrationSystem.validateMigrations();
      console.log(ok ? 'Migrations valid' : 'Migration validation failed');
      process.exitCode = ok ? 0 : 1;
    } else if (command === 'create') {
      const name = process.argv[3];
      if (!name) {
        console.error('Usage: node scripts/migrate.js create <name>');
        process.exitCode = 1;
      } else {
        const filename = await migrationSystem.createMigration(
          name,
          `-- Migration: ${name}\nBEGIN;\n\n-- TODO\n\nCOMMIT;\n`,
        );
        console.log(`Created ${filename}`);
      }
    } else {
      console.error(`Unknown command: ${command}`);
      console.error('Commands: run | status | validate | create <name>');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main();
