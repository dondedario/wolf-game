#!/usr/bin/env tsx
/**
 * Database setup script for WOLF game
 * Automatically sets up all database tables and migrations
 * 
 * Usage: npm run setup:db
 * 
 * Required environment variables:
 * - NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL): Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for admin access
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env.local file
config({ path: resolve(process.cwd(), '.env.local') });

function getConnectionString(): string {
  // Prefer explicit database connection URL if provided
  if (process.env.SUPABASE_DB_URL) {
    const dbUrl = process.env.SUPABASE_DB_URL;
    // Replace placeholder passwords if present
    const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (password && (dbUrl.includes('<PASSWORD>') || dbUrl.includes('<YOUR-PASSWORD>'))) {
      return dbUrl.replace('<PASSWORD>', encodeURIComponent(password)).replace('<YOUR-PASSWORD>', encodeURIComponent(password));
    }
    return dbUrl;
  }

  // Otherwise, try to construct from Supabase URL and service role key
  // Note: For direct PostgreSQL connections, you typically need the database password,
  // not the service role key. The service role key is for API authentication.
  // For best results, use SUPABASE_DB_URL from Supabase Dashboard > Settings > Database
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      'Missing SUPABASE_URL. Please set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL environment variable.\n' +
      'Alternatively, set SUPABASE_DB_URL with the full connection string from Supabase Dashboard.'
    );
  }

  if (!dbPassword) {
    throw new Error(
      'Missing database password. Please set one of:\n' +
      '  - SUPABASE_DB_PASSWORD (recommended: get from Supabase Dashboard > Settings > Database)\n' +
      '  - SUPABASE_SERVICE_ROLE_KEY (may not work for direct connections)\n' +
      '  - SUPABASE_DB_URL (full connection string from dashboard)'
    );
  }

  // Extract project reference from Supabase URL
  // URL format: https://[project-ref].supabase.co
  const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    throw new Error(
      `Invalid Supabase URL format: ${supabaseUrl}. Expected format: https://[project-ref].supabase.co\n` +
      'Alternatively, use SUPABASE_DB_URL with the full connection string.'
    );
  }

  const projectRef = urlMatch[1];
  
  // Construct direct connection string
  // Format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
  // Note: This may not work if your database password differs from the service role key
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');

  let client: Client | null = null;

  try {
    // Get connection string
    const connectionString = getConnectionString();
    console.log('📡 Connecting to Supabase database...');

    // Create PostgreSQL client
    client = new Client({
      connectionString,
      ssl: {
        rejectUnauthorized: false, // Supabase uses SSL
      },
    });

    await client.connect();
    console.log('✅ Connected to database\n');

    // Read schema SQL file
    // Use process.cwd() to get project root, then navigate to scripts/database/schema.sql
    const schemaPath = join(process.cwd(), 'scripts', 'database', 'schema.sql');
    console.log(`📖 Reading schema from: ${schemaPath}`);
    const schemaSQL = readFileSync(schemaPath, 'utf-8');
    console.log('✅ Schema file loaded\n');

    // Split SQL into individual statements (handling DO blocks and multi-line statements)
    // Execute the entire schema as-is (PostgreSQL can handle it)
    console.log('🔧 Executing schema...');
    
    await client.query(schemaSQL);
    
    console.log('✅ Schema executed successfully\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('games', 'players', 'night_actions')
      ORDER BY table_name;
    `);

    const expectedTables = ['games', 'players', 'night_actions'];
    const createdTables = tablesResult.rows.map((row) => row.table_name);

    console.log(`   Found tables: ${createdTables.join(', ')}`);

    const missingTables = expectedTables.filter((table) => !createdTables.includes(table));
    if (missingTables.length > 0) {
      console.warn(`   ⚠️  Warning: Missing tables: ${missingTables.join(', ')}`);
    } else {
      console.log('   ✅ All expected tables exist\n');
    }

    // Check columns for games table
    const gamesColumnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'games' 
      ORDER BY ordinal_position;
    `);
    console.log('📊 Games table columns:');
    gamesColumnsResult.rows.forEach((row) => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });

    console.log('\n✅ Database setup completed successfully!');
    console.log('\n🎉 Your database is ready to use. You can now run your application.');

  } catch (error: any) {
    console.error('\n❌ Database setup failed:');
    console.error(`   Error code: ${error.code || 'N/A'}`);
    console.error(`   Error message: ${error.message || error}`);
    
    if (error.code === 'ECONNREFUSED' || error.message?.includes('connect')) {
      console.error('\n   Connection failed. Please check:');
      console.error('   1. Your Supabase URL is correct');
      console.error('   2. Your database password/credentials are correct');
      console.error('   3. Your database is accessible');
      console.error('   4. Try using connection pooling URL instead (see below)');
      console.error('\n   💡 Recommended: Set SUPABASE_DB_URL with the full connection string');
      console.error('   from Supabase Dashboard > Settings > Database > Connection string');
      console.error('   Try "Connection pooling" mode if "Direct connection" doesn\'t work');
      console.error('   (Copy the URI and replace <YOUR-PASSWORD> with your database password)');
    } else if (error.message?.includes('authentication') || error.code === '28P01') {
      console.error('   Authentication failed. This usually means:');
      console.error('   - The database password is incorrect');
      console.error('   - You\'re using the service role key instead of the database password');
      console.error('\n   💡 Solution: Get the database password from:');
      console.error('   Supabase Dashboard > Settings > Database > Connection string');
      console.error('   Or set SUPABASE_DB_URL with the full connection string from the dashboard');
    } else if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
      console.error('   SQL execution error. Some tables or columns may not exist.');
      console.error('   This is normal if running on a fresh database.');
      console.error(`   Error: ${error.message}`);
    } else {
      console.error(`   ${error.message || error}`);
      if (error.detail) {
        console.error(`   Detail: ${error.detail}`);
      }
      if (error.hint) {
        console.error(`   Hint: ${error.hint}`);
      }
    }
    
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run setup
setupDatabase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
