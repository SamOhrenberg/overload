-- Routines: named exercise groups, a recurring weekly schedule, and same-day
-- plan overrides. All owner-scoped by user_id. Groups are many-to-many with
-- exercises (Bench can be in both "Push" and "Upper Body"); a weekday or a date
-- can map to many groups. day_plan is the same-day swap: when any row exists for
-- (user, date) it REPLACES the weekday's scheduled groups for that date only;
-- absence falls back to routine_schedule. Dropping a group cascades to its
-- memberships, schedule rows, and day-plan rows.

CREATE TABLE IF NOT EXISTS exercise_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  icon text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exercise_groups_user_idx ON exercise_groups (user_id);

CREATE TABLE IF NOT EXISTS exercise_group_members (
  group_id uuid NOT NULL REFERENCES exercise_groups(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, exercise_id)
);
CREATE INDEX IF NOT EXISTS exercise_group_members_ex_idx ON exercise_group_members (exercise_id);

CREATE TABLE IF NOT EXISTS routine_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  group_id uuid NOT NULL REFERENCES exercise_groups(id) ON DELETE CASCADE,
  CONSTRAINT routine_schedule_uniq UNIQUE (user_id, day_of_week, group_id)
);
CREATE INDEX IF NOT EXISTS routine_schedule_user_day_idx ON routine_schedule (user_id, day_of_week);

CREATE TABLE IF NOT EXISTS day_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  group_id uuid NOT NULL REFERENCES exercise_groups(id) ON DELETE CASCADE,
  CONSTRAINT day_plan_uniq UNIQUE (user_id, date, group_id)
);
CREATE INDEX IF NOT EXISTS day_plan_user_date_idx ON day_plan (user_id, date);
