-- Create oauth_config table for storing OAuth provider configurations
-- This table stores OAuth client IDs and secrets for various providers

CREATE TABLE IF NOT EXISTS oauth_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider, key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_config_provider ON oauth_config(provider);

-- Enable RLS (Row Level Security)
ALTER TABLE oauth_config ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can read (you may want to restrict this further)
-- For public OAuth configs, you might want to allow anonymous reads
CREATE POLICY "Allow authenticated users to read oauth config"
  ON oauth_config FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only service role or specific admin users can insert/update
-- For now, we'll allow authenticated users, but you should restrict this in production
-- Consider using service_role key for these operations instead
CREATE POLICY "Allow authenticated users to manage oauth config"
  ON oauth_config FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Example: Insert Linux.do OAuth configuration
-- Replace 'your_client_id_here' and 'your_client_secret_here' with actual values
-- You can run these INSERT statements in Supabase SQL Editor after creating the table

-- INSERT INTO oauth_config (provider, key, value) VALUES
--   ('linuxdo', 'client_id', 'your_client_id_here'),
--   ('linuxdo', 'client_secret', 'your_client_secret_here')
-- ON CONFLICT (provider, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

