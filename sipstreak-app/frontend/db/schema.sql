-- SipStreak relational storage (PostgreSQL). Applied automatically on first use (idempotent);
-- also available here for managed migrations (Supabase, Neon, RDS, ...).
CREATE TABLE IF NOT EXISTS sipstreak_documents (
  key        text        PRIMARY KEY,
  data       jsonb       NOT NULL,
  version    bigint      NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- prefix scans (users/, auth/) use this index
CREATE INDEX IF NOT EXISTS sipstreak_documents_key_prefix ON sipstreak_documents (key text_pattern_ops);
