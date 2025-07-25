# Database Migrations for Patient-Caregiver Connection System

## How to Apply These Migrations

Since the local Supabase CLI requires Docker, you can apply these migrations directly in your Supabase dashboard:

### Method 1: Supabase Dashboard (SQL Editor)

1. Go to your Supabase project dashboard
2. Navigate to "SQL Editor" in the sidebar
3. Copy and paste the contents of each migration file in order:
   - `002_create_connection_tables.sql`
   - `003_create_profiles_table.sql`
4. Run each migration script

### Method 2: Using Supabase CLI (if Docker is available)

```bash
# Start Supabase locally
npx supabase start

# Reset database with migrations
npx supabase db reset

# Or push migrations to remote
npx supabase db push
```

### Migration Order

1. **002_create_connection_tables.sql** - Creates the core connection tables
2. **003_create_profiles_table.sql** - Creates/ensures profiles table exists

### Verification

After applying migrations, verify the tables exist:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('linking_invitations', 'patient_caregiver_connections', 'profiles');

-- Check sample data
SELECT * FROM linking_invitations LIMIT 5;
SELECT * FROM patient_caregiver_connections LIMIT 5;
```

### Troubleshooting

If you get errors about:
- `update_updated_at_column()` function already exists: This is fine, the function will be replaced
- RLS policies already exist: Use `DROP POLICY IF EXISTS` before creating if needed
- Tables already exist: The `IF NOT EXISTS` clause should handle this

## What These Migrations Fix

1. **Missing Tables**: Creates `linking_invitations` and `patient_caregiver_connections` tables
2. **Table Name Mismatch**: Code was looking for these specific table names
3. **RLS Policies**: Proper security for patient-caregiver data access
4. **Indexes**: Performance optimization for common queries 