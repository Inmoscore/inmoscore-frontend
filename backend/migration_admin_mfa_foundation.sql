-- Administrative MFA foundation for TOTP-based critical action protection.

alter table users
  add column if not exists mfa_enabled boolean not null default false,
  add column if not exists mfa_secret_encrypted text,
  add column if not exists mfa_enabled_at timestamptz,
  add column if not exists mfa_last_verified_at timestamptz,
  add column if not exists mfa_backup_codes_hash jsonb;

create index if not exists idx_users_mfa_enabled
  on users (mfa_enabled);
