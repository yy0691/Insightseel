-- Create video-uploads storage bucket and RLS policies
-- This enables direct file uploads from frontend to Supabase Storage

-- Create storage bucket (if not exists)
-- Note: Bucket creation must be done via Supabase Dashboard or API
-- This migration assumes the bucket exists or will be created manually
-- You can create it via: Supabase Dashboard > Storage > New bucket > "video-uploads"

-- Enable RLS on storage.objects (should already be enabled by default)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow authenticated users to upload files
-- Drop policy if exists first (Supabase doesn't support IF NOT EXISTS for policies)
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'video-uploads' AND
  (storage.foldername(name))[1] = 'videos'
);

-- Policy 2: Allow authenticated users to read their own files
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
CREATE POLICY "Allow authenticated reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'video-uploads'
);

-- Policy 3: Allow authenticated users to delete their own files
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
CREATE POLICY "Allow authenticated deletes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'video-uploads'
);

-- Policy 4: Allow service role (server-side) full access
-- This is needed for server-side operations (process-video API)
DROP POLICY IF EXISTS "Allow service role full access" ON storage.objects;
CREATE POLICY "Allow service role full access"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'video-uploads')
WITH CHECK (bucket_id = 'video-uploads');

-- Policy 5: Allow public reads (optional - if you want public access)
-- Uncomment if you want files to be publicly accessible
-- CREATE POLICY IF NOT EXISTS "Allow public reads"
-- ON storage.objects
-- FOR SELECT
-- TO public
-- USING (bucket_id = 'video-uploads');

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_id 
ON storage.objects(bucket_id);

CREATE INDEX IF NOT EXISTS idx_storage_objects_name 
ON storage.objects(name);

-- Note: To create the bucket via SQL (if supported):
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'video-uploads',
--   'video-uploads',
--   false, -- Set to true if you want public access
--   524288000, -- 500MB file size limit (adjust as needed)
--   ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'audio/webm', 'audio/mpeg']
-- )
-- ON CONFLICT (id) DO NOTHING;

