const { Client } = require('pg');
require('dotenv').config();

async function testConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔍 Testing PostgreSQL connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    await client.connect();
    console.log('✅ Connected to PostgreSQL!');
    
    // Test basic query
    const versionResult = await client.query('SELECT version()');
    console.log('📊 PostgreSQL version:', versionResult.rows[0].version);
    
    // Check if grassroots schema exists
    const schemaResult = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'grassroots'
    `);
    console.log('🌱 Grassroots schema exists:', schemaResult.rows.length > 0);
    
    // List tables in grassroots schema
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'grassroots'
    `);
    console.log('📋 Tables in grassroots schema:', tablesResult.rows.map(r => r.table_name));
    
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error(error.message);
  } finally {
    await client.end();
  }
}

testConnection();