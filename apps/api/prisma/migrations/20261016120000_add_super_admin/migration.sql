-- Add isSuperAdmin flag to users table
ALTER TABLE users ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Set sumit.singh@kalvium.com as super admin
UPDATE users SET "isSuperAdmin" = true WHERE email = 'sumit.singh@kalvium.com';
