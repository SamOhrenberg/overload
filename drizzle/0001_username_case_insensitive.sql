-- Enforce case-insensitive uniqueness of usernames (sam == Sam).
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
