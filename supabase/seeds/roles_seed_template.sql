-- Roles seed template (template only — do NOT execute without review)
-- Insert canonical roles into `public.roles`.
-- Replace UUIDs as needed or use `gen_random_uuid()` after ensuring the
-- required extension is available in the target database.

INSERT INTO public.roles (id, name, description, created_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Platform Owner', 'Platform-level owner', now()),
  ('00000000-0000-0000-0000-000000000002', 'Local Enterprise Owner', 'Enterprise-level owner', now()),
  ('00000000-0000-0000-0000-000000000003', 'Local Super Admin', 'Enterprise super admin', now()),
  ('00000000-0000-0000-0000-000000000004', 'Head of Department', 'Head of Department (HOD)', now()),
  ('00000000-0000-0000-0000-000000000005', 'Direct Manager', 'Direct reporting manager', now()),
  ('00000000-0000-0000-0000-000000000006', 'Engineer', 'Engineering role', now()),
  ('00000000-0000-0000-0000-000000000007', 'Designer', 'Design role', now()),
  ('00000000-0000-0000-0000-000000000008', 'Survey Uploader', 'Uploads survey/field data', now()),
  ('00000000-0000-0000-0000-000000000009', 'Client', 'Client role', now());

-- End of template
