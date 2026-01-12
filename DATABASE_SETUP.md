# Database Setup - Simple Guide

## Option 1: Manual SQL Setup (Easiest - No Password Needed!)

This is the simplest method and requires no passwords or connection strings:

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/ugkmhbfmsdmqjvvwkyif
   - Click on **"SQL Editor"** in the left sidebar

2. **Run the Schema**
   - Click **"New query"**
   - Copy and paste the entire contents of `scripts/database/schema.sql`
   - Click **"Run"** (or press Cmd/Ctrl + Enter)

That's it! Your database will be set up. The SQL is idempotent, so you can run it multiple times safely.

---

## Option 2: Automated Setup (Requires Database Password)

If you want to use the automated script:

### Step 1: Get Your Database Password

1. Go to Supabase Dashboard → **Settings** → **Database**
2. Scroll down to **"Connection info"** section
3. Look for **"Database password"** - if it's hidden, click **"Reset database password"**
4. Copy the new password (you'll only see it once!)

### Step 2: Update .env.local

Replace `<YOUR-DB-PASSWORD>` in the `SUPABASE_DB_URL` line with your actual password:

```env
SUPABASE_DB_URL=postgresql://postgres:YOUR_ACTUAL_PASSWORD@db.ugkmhbfmsdmqjvvwkyif.supabase.co:5432/postgres
```

### Step 3: Run the Setup Script

```bash
npm run setup:db
```

---

## Option 3: Use Service Role Key (May Not Work)

**Note:** Service role keys are for API authentication, not direct database connections. This may not work.

1. Get Service Role Key: Supabase Dashboard → **Settings** → **API** → **service_role** (secret key)
2. Add to `.env.local`:
   ```env
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```
3. Try running: `npm run setup:db`

If this doesn't work, use Option 1 (Manual SQL) instead.

---

## Recommendation

**Use Option 1 (Manual SQL)** - It's the fastest, easiest, and requires no credentials. Just copy-paste and run in the SQL Editor!
