-- Add Linux.do OAuth fields to profiles table
-- This allows storing Linux.do user information and tokens

-- Add columns for Linux.do OAuth data
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS linuxdo_user_id text,
  ADD COLUMN IF NOT EXISTS linuxdo_username text,
  ADD COLUMN IF NOT EXISTS linuxdo_access_token text,
  ADD COLUMN IF NOT EXISTS linuxdo_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS linuxdo_user_data jsonb;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_linuxdo_user_id ON profiles(linuxdo_user_id) WHERE linuxdo_user_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.linuxdo_user_id IS 'Linux.do user ID from OAuth';
COMMENT ON COLUMN profiles.linuxdo_username IS 'Linux.do username';
COMMENT ON COLUMN profiles.linuxdo_access_token IS 'Linux.do OAuth access token (encrypted in production)';
COMMENT ON COLUMN profiles.linuxdo_token_expires_at IS 'Linux.do token expiration time';
COMMENT ON COLUMN profiles.linuxdo_user_data IS 'Full Linux.do user information as JSON';

