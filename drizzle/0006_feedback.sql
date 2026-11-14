-- In-app feedback. Each row is mirrored to a GitHub issue (when a repo + token
-- are configured); the issue number lets the submitter later see its status and
-- any replies. Owner-scoped by user_id.

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  github_issue_number integer,
  github_issue_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id, created_at DESC);
