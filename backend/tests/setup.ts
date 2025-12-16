import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Ensure .env is loaded from the backend directory regardless of CWD
dotenv.config({ path: resolve(__dirname, '../.env') });

// Global test setup
let prisma: PrismaClient;

beforeAll(async () => {
  // Initialize Prisma client for tests
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:pass@localhost:5432/postgres'
      }
    }
  });

  // Connect to database
  await prisma.$connect();
});

afterAll(async () => {
  // Cleanup and disconnect
  await prisma.$disconnect();
});

// Make prisma available globally for tests
declare global {
  var testPrisma: PrismaClient;
}

global.testPrisma = prisma;
