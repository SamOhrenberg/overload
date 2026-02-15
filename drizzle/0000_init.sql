CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  email text,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  default_unit text NOT NULL DEFAULT 'lb',
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note text,
  max_uses integer NOT NULL DEFAULT 1,
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  modality text NOT NULL,
  kind text NOT NULL,
  muscle_groups text[] NOT NULL DEFAULT '{}',
  unit text NOT NULL DEFAULT 'lb',
  load_increment numeric,
  default_goal text,
  is_archived boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS exercises_owner_idx ON exercises(owner_id);

CREATE TABLE IF NOT EXISTS exercise_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  goal text NOT NULL,
  stamina_mode text,
  rep_low integer,
  rep_high integer,
  target_sets integer NOT NULL DEFAULT 3,
  target_rir integer NOT NULL DEFAULT 2,
  cardio_metric text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exercise_goals_user_exercise_idx ON exercise_goals(user_id, exercise_id);

CREATE TABLE IF NOT EXISTS workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text,
  notes text,
  readiness jsonb,
  session_rpe integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS workouts_user_started_idx ON workouts(user_id, started_at);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  order_index integer NOT NULL DEFAULT 0,
  goal_snapshot text NOT NULL,
  notes text
);

CREATE TABLE IF NOT EXISTS sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_index integer NOT NULL,
  is_warmup boolean NOT NULL DEFAULT false,
  weight numeric,
  reps integer NOT NULL,
  rir integer,
  rpe numeric,
  tempo text,
  rest_sec integer,
  is_pr boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS sets_workout_exercise_idx ON sets(workout_exercise_id);

CREATE TABLE IF NOT EXISTS cardio_bouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  duration_sec integer NOT NULL,
  distance numeric,
  avg_pace_sec integer,
  avg_hr integer,
  max_hr integer,
  intervals jsonb,
  perceived integer
);

CREATE TABLE IF NOT EXISTS recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  goal text NOT NULL,
  target jsonb NOT NULL,
  rationale text NOT NULL,
  basis jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recommendations_user_exercise_idx ON recommendations(user_id, exercise_id);

CREATE TABLE IF NOT EXISTS personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  kind text NOT NULL,
  value numeric NOT NULL,
  source_set_id uuid,
  achieved_at timestamptz NOT NULL DEFAULT now()
);
