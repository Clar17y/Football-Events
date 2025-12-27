import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { execFileSync } from 'child_process';

// Ensure .env is loaded from the backend directory regardless of CWD
dotenv.config({ path: resolve(__dirname, '../.env') });

// Global test setup
let prisma: PrismaClient | undefined;
const RUN_DB_TESTS = process.env['RUN_DB_TESTS'] === 'true';

beforeAll(async () => {
  if (!RUN_DB_TESTS) {
    console.warn('[tests/setup] RUN_DB_TESTS is not enabled; skipping database setup.');
    return;
  }

  const databaseUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:pass@localhost:5432/postgres';

  // Standardize on a single URL across all tests (many test files use one or the other).
  process.env.TEST_DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;

  // Ensure migrations are applied for the test DB (includes new subscription_tier column).
  try {
    const prismaBin = resolve(__dirname, '../../node_modules/.bin/prisma');
    execFileSync(prismaBin, ['migrate', 'deploy'], {
      cwd: resolve(__dirname, '..'),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[tests/setup] Prisma migrate deploy failed. Is Postgres running and DATABASE_URL reachable?');
    throw err;
  }

  // Initialize Prisma client for tests
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });

  // Connect to database
  await prisma.$connect();

  // Make tests hermetic: start from a clean schema without relying on dev data.
  try {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'grassroots' AND table_type = 'BASE TABLE'
    `;
    const tableNames = tables
      .map((t) => t.table_name)
      .filter((name) => name && name !== '_prisma_migrations')
      .map((name) => `"grassroots"."${name}"`)
      .join(', ');
    if (tableNames) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
    }
  } catch (err) {
    console.warn('[tests/setup] Failed to truncate tables (continuing):', err);
  }

  global.testPrisma = prisma;
});

afterAll(async () => {
  // Cleanup and disconnect
  if (!prisma) return;
  await prisma.$disconnect();
});

// Make prisma available globally for tests
declare global {
  // eslint-disable-next-line no-var
  var testPrisma: PrismaClient | undefined;
}

global.testPrisma = prisma;
