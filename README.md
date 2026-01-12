This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Supabase account and project ([create one here](https://supabase.com))

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase Configuration
# Get these from: Supabase Dashboard > Settings > API

NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# For database setup, you need one of these:
# Option 1 (Recommended): Full connection string from Supabase Dashboard
SUPABASE_DB_URL=postgresql://postgres:[YOUR-DB-PASSWORD]@db.your-project-ref.supabase.co:5432/postgres

# Option 2: Database password (script will construct connection string)
SUPABASE_DB_PASSWORD=your-database-password-here

# Option 3: Service role key (may not work for direct DB connections)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Where to find these values:**
- Go to your Supabase project dashboard
- Navigate to Settings > API
  - Copy the "Project URL" for `NEXT_PUBLIC_SUPABASE_URL`
  - Copy the "anon public" key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Navigate to Settings > Database
  - **Recommended**: Copy the "Connection string" (Direct connection) for `SUPABASE_DB_URL`
    - Replace `<YOUR-PASSWORD>` or `[YOUR-PASSWORD]` with your actual database password
  - **Alternative**: Get the database password and set `SUPABASE_DB_PASSWORD`

**Note**: The service role key is for API authentication, but for direct database connections, you typically need the actual database password. Using `SUPABASE_DB_URL` is the most reliable option.

### Database Setup

**Zero manual steps required!** The database setup is fully automated:

```bash
npm run setup:db
```

This single command will:
- ✅ Create all required tables (`games`, `players`, `night_actions`)
- ✅ Set up all columns and indexes
- ✅ Run all migrations
- ✅ Verify the setup

The script is **idempotent** - you can run it multiple times safely. It will skip existing tables and only add missing columns or indexes.

**Alternative commands:**
- `npm run db:setup` - Same as `setup:db`
- `npm run db:migrate` - Same as `setup:db`

**Troubleshooting:**

If you encounter connection issues:

1. **Use the connection string from Supabase Dashboard** (most reliable):
   - Go to Supabase Dashboard > Settings > Database
   - Copy the "Connection string" under "Direct connection"
   - Replace `<YOUR-PASSWORD>` with your actual database password
   - Set it as `SUPABASE_DB_URL` in your `.env.local`

2. **Get the database password**:
   - The database password is different from the service role key
   - It's shown in the connection string or you can reset it in Settings > Database
   - Set it as `SUPABASE_DB_PASSWORD` in your `.env.local`

3. **Check that your database is accessible**:
   - Ensure your Supabase project is active
   - Check that connection pooling or direct connections are enabled (usually enabled by default)

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
