const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testPrismaConnection() {
  try {
    console.log('🔍 Testing Prisma connection...');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Prisma connected successfully!');
    
    // Test a raw query to grassroots schema
    const result = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'grassroots' LIMIT 5`;
    console.log('📋 Tables found via Prisma:', result);
    
    // Test if we can query the teams table directly
    const teamsCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM grassroots.teams`;
    console.log('👥 Teams count:', teamsCount);
    
  } catch (error) {
    console.error('❌ Prisma connection failed:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testPrismaConnection();