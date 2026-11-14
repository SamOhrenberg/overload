-- MCP access: OAuth 2.1 (dynamic client registration + PKCE) for AI clients,
-- and comments those clients (or the app) leave on a user's data.

CREATE TABLE IF NOT EXISTS oauth_clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  redirect_uris text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Short-lived authorization codes. id = sha256(code).
CREATE TABLE IF NOT EXISTS oauth_codes (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text NOT NULL,
  resource text,
  expires_at timestamptz NOT NULL
);

-- Access + refresh tokens. id = sha256(token); the raw token is never stored.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id text PRIMARY KEY,
  kind text NOT NULL,
  client_id text NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  resource text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_tokens_user_idx ON oauth_tokens (user_id, client_id);

-- Comments on a user's own data. target_type is workout | exercise | set |
-- general; target_id is null for general comments. Owner-scoped by user_id.
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid,
  body text NOT NULL,
  author text NOT NULL,
  client_id text REFERENCES oauth_clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_target_idx ON comments (user_id, target_type, target_id);
