-- Allow authenticated users and service role to read SBC files from storage
CREATE POLICY "Allow public read access to SBC bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ssss');

-- Allow service role full access for file management
CREATE POLICY "Allow service role full access to SBC bucket"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'ssss')
WITH CHECK (bucket_id = 'ssss');