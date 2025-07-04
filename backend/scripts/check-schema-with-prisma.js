const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function checkSchemaWithPrisma() {
  try {
    console.log('🔍 Checking PostgreSQL schema via Prisma...\n');
    
    // Get all tables in grassroots schema
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'grassroots'
      ORDER BY table_name
    `;
    
    console.log('📋 Tables in grassroots schema:');
    tables.forEach(table => console.log(`  - ${table.table_name}`));
    console.log('');
    
    // Check specific tables we care about
    const tablesToCheck = ['teams', 'players', 'matches', 'events', 'lineup'];
    
    for (const tableName of tablesToCheck) {
      console.log(`\n📊 Table: ${tableName}`);
      console.log('=' .repeat(50));
      
      const columns = await prisma.$queryRaw`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'grassroots' 
        AND table_name = ${tableName}
        ORDER BY ordinal_position
      `;
      
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(required)';
        const defaultVal = col.column_default ? `default: ${col.column_default}` : '';
        console.log(`  ${col.column_name}: ${col.data_type} ${nullable} ${defaultVal}`);
      });
    }
    
    // Check event_kind enum
    console.log('\n🔤 Event Kind Enum Values:');
    const enumValues = await prisma.$queryRaw`
      SELECT enumlabel as value
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'event_kind'
      ORDER BY e.enumsortorder
    `;
    
    enumValues.forEach(val => console.log(`  - ${val.value}`));
    
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchemaWithPrisma();