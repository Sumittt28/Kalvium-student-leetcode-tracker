-- One-off data change: reset the admin@kalvium.com password at the owner's request.
-- Applied by `prisma migrate deploy` on the next deploy. Matches no row on a database
-- without that account. passwordChangedAt is set so the login skips the forced change.
UPDATE "users"
SET "passwordHash" = '$2a$12$ignel98N5t13sJxvT20nqeeFfR3bSbDezlobbE4uNgIl0p22TePTi',
    "passwordChangedAt" = now(),
    "isActive" = true
WHERE "email" = 'admin@kalvium.com';
