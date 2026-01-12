#!/usr/bin/env tsx
/**
 * Fix Realtime Configuration Script
 * Executes SQL commands to enable real-time subscriptions for Supabase
 * 
 * Usage: npm run fix:realtime
 * Or: npx tsx scripts/fix-realtime.ts
 * 
 * Required environment variables:
 * - SUPABASE_DB_URL (recommended) or
 * - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { Client } from 'pg';

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
  const urlMatch = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (!urlMatch) {
    throw new Error(
      `Invalid Supabase URL format: ${supabaseUrl}. Expected format: https://[project-ref].supabase.co\n` +
      'Alternatively, use SUPABASE_DB_URL with the full connection string.'
    );
  }

  const projectRef = urlMatch[1];
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
}

async function fixRealtime() {
  console.log('🔧 Fixing Realtime Configuration...\n');

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

    // Step 1: Set REPLICA IDENTITY
    console.log('📝 Setting REPLICA IDENTITY FULL for tables...');
    await client.query('ALTER TABLE players REPLICA IDENTITY FULL;');
    console.log('   ✅ players table');
    await client.query('ALTER TABLE games REPLICA IDENTITY FULL;');
    console.log('   ✅ games table');
    await client.query('ALTER TABLE night_actions REPLICA IDENTITY FULL;');
    console.log('   ✅ night_actions table\n');

    // Step 2: Add tables to realtime publication
    console.log('📢 Adding tables to realtime publication...');
    try {
      await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE games;');
      console.log('   ✅ games table added');
    } catch (e: any) {
      if (e.message?.includes('already exists') || e.code === '42710') {
        console.log('   ℹ️  games table already in publication');
      } else {
        throw e;
      }
    }
    
    try {
      await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE players;');
      console.log('   ✅ players table added');
    } catch (e: any) {
      if (e.message?.includes('already exists') || e.code === '42710') {
        console.log('   ℹ️  players table already in publication');
      } else {
        throw e;
      }
    }
    
    try {
      await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE night_actions;');
      console.log('   ✅ night_actions table added');
    } catch (e: any) {
      if (e.message?.includes('already exists') || e.code === '42710') {
        console.log('   ℹ️  night_actions table already in publication');
      } else {
        throw e;
      }
    }
    console.log('');

    // Step 3: Verify tables are in the publication
    console.log('🔍 Verifying tables are in realtime publication...');
    const publicationResult = await client.query(`
      SELECT schemaname, tablename 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename IN ('games', 'players', 'night_actions')
      ORDER BY tablename;
    `);
    
    const expectedTables = ['games', 'players', 'night_actions'];
    const publishedTables = publicationResult.rows.map((row) => row.tablename);
    
    console.log(`   Found in publication: ${publishedTables.join(', ')}`);
    const missingTables = expectedTables.filter((table) => !publishedTables.includes(table));
    if (missingTables.length > 0) {
      console.warn(`   ⚠️  Warning: Missing from publication: ${missingTables.join(', ')}`);
    } else {
      console.log('   ✅ All tables are in the realtime publication\n');
    }

    // Step 4: Verify REPLICA IDENTITY is set correctly
    console.log('🔍 Verifying REPLICA IDENTITY settings...');
    const replicaResult = await client.query(`
      SELECT 
        n.nspname as schemaname,
        c.relname as tablename,
        CASE c.relreplident
          WHEN 'd' THEN 'DEFAULT'
          WHEN 'n' THEN 'NOTHING'
          WHEN 'f' THEN 'FULL'
          WHEN 'i' THEN 'INDEX'
          ELSE 'UNKNOWN'
        END as replica_identity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('games', 'players', 'night_actions')
        AND c.relkind = 'r'
      ORDER BY c.relname;
    `);
    
    console.log('   REPLICA IDENTITY status:');
    let allFull = true;
    replicaResult.rows.forEach((row) => {
      const status = row.replica_identity === 'FULL' ? '✅' : '❌';
      console.log(`   ${status} ${row.tablename}: ${row.replica_identity}`);
      if (row.replica_identity !== 'FULL') {
        allFull = false;
      }
    });
    
    if (allFull) {
      console.log('\n   ✅ All tables have REPLICA IDENTITY FULL\n');
    } else {
      console.warn('\n   ⚠️  Some tables do not have REPLICA IDENTITY FULL\n');
    }

    console.log('✅ Realtime configuration fixed successfully!');
    console.log('\n🎉 Real-time subscriptions should now work correctly.');
    console.log('   You can now test by joining a game from a new browser.');

  } catch (error: any) {
    console.error('\n❌ Failed to fix realtime configuration:');
    console.error(`   Error code: ${error.code || 'N/A'}`);
    console.error(`   Error message: ${error.message || error}`);
    
    if (error.code === 'ECONNREFUSED' || error.message?.includes('connect')) {
      console.error('\n   Connection failed. Please check:');
      console.error('   1. Your Supabase URL is correct');
      console.error('   2. Your database password/credentials are correct');
      console.error('   3. Your database is accessible');
      console.error('\n   💡 Recommended: Set SUPABASE_DB_URL with the full connection string');
      console.error('   from Supabase Dashboard > Settings > Database > Connection string');
    } else if (error.message?.includes('authentication') || error.code === '28P01') {
      console.error('   Authentication failed. This usually means:');
      console.error('   - The database password is incorrect');
      console.error('   - You\'re using the service role key instead of the database password');
      console.error('\n   💡 Solution: Get the database password from:');
      console.error('   Supabase Dashboard > Settings > Database > Connection string');
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

// Run fix
fixRealtime().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
