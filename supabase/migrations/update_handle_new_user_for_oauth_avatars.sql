-- Update handle_new_user function to better extract avatars from OAuth providers
-- This migration updates the function to check multiple possible avatar field names
-- from Google and GitHub OAuth providers

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  avatar_url_value text;
BEGIN
  -- Extract avatar URL from multiple possible locations in user metadata
  -- Google OAuth: avatar_url or picture
  -- GitHub OAuth: avatar_url
  avatar_url_value := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    NEW.raw_user_meta_data->>'avatar'
  );

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    ),
    avatar_url_value
  )
  ON CONFLICT (id) DO UPDATE SET
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also create a function to sync avatars for existing users
CREATE OR REPLACE FUNCTION public.sync_oauth_avatars()
RETURNS void AS $$
BEGIN
  -- Update profiles with avatars from auth.users metadata for existing users
  UPDATE public.profiles p
  SET 
    avatar_url = COALESCE(
      (SELECT raw_user_meta_data->>'avatar_url' FROM auth.users WHERE id = p.id),
      (SELECT raw_user_meta_data->>'picture' FROM auth.users WHERE id = p.id),
      (SELECT raw_user_meta_data->>'avatar' FROM auth.users WHERE id = p.id),
      p.avatar_url
    ),
    updated_at = now()
  WHERE p.avatar_url IS NULL
    AND EXISTS (
      SELECT 1 FROM auth.users u 
      WHERE u.id = p.id 
      AND (
        u.raw_user_meta_data->>'avatar_url' IS NOT NULL OR
        u.raw_user_meta_data->>'picture' IS NOT NULL OR
        u.raw_user_meta_data->>'avatar' IS NOT NULL
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the sync function to update existing users
SELECT public.sync_oauth_avatars();

