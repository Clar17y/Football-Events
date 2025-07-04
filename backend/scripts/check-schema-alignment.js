const { Client } = require('pg');
require('dotenv').config();

async function checkSchemaAlignment() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('🔍 Checking PostgreSQL schema structure...\n');
    
    // Get all tables in grassroots schema
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'grassroots'
      ORDER BY table_name
    `);
    
    console.log('📋 Tables in grassroots schema:');
    const tables = tablesResult.rows.map(r => r.table_name);
    tables.forEach(table => console.log(`  - ${table}`));
    console.log('');
    
    // Get detailed structure for each table
    for (const tableName of tables) {
      console.log(`\n📊 Table: ${tableName}`);
      console.log('=' .repeat(50));
      
      const columnsResult = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'grassroots' 
        AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      columnsResult.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(required)';
        const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        const defaultVal = col.column_default ? `default: ${col.column_default}` : '';
        console.log(`  ${col.column_name}: ${col.data_type}${length} ${nullable} ${defaultVal}`);
      });
      
      // Get constraints
      const constraintsResult = await client.query(`
        SELECT 
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'grassroots' 
        AND tc.table_name = $1
      `, [tableName]);
      
      if (constraintsResult.rows.length > 0) {
        console.log('  Constraints:');
        constraintsResult.rows.forEach(constraint => {
          console.log(`    ${constraint.constraint_type}: ${constraint.column_name} (${constraint.constraint_name})`);
        });
      }
    }
    
    // Check for enums
    console.log('\n🔤 Enums in grassroots schema:');
    const enumsResult = await client.query(`
      SELECT 
        t.typname as enum_name,
        e.enumlabel as enum_value
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'grassroots'
      ORDER BY t.typname, e.enumsortorder
    `);
    
    const enums = {};
    enumsResult.rows.forEach(row => {
      if (!enums[row.enum_name]) {
        enums[row.enum_name] = [];
      }
      enums[row.enum_name].push(row.enum_value);
    });
    
    Object.keys(enums).forEach(enumName => {
      console.log(`  ${enumName}: [${enums[enumName].join(', ')}]`);
    });
    
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  } finally {
    await client.end();
  }
}

checkSchemaAlignment();