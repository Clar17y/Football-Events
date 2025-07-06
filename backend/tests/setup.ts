import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from 'vitest';

// Global test setup
let prisma: PrismaClient;

beforeAll(async () => {
  // Initialize Prisma client for tests
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/grassroots_test'
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