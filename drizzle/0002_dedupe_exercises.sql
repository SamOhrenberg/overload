-- Remove duplicate exercises created by a non-idempotent seed, then prevent
-- future duplicates with unique indexes (built-ins by name; custom by owner+name).

-- 1. Map every exercise to the canonical (kept) row for its (owner, name) group.
CREATE TEMP TABLE ex_dedup AS
SELECT id,
       first_value(id) OVER (
         PARTITION BY COALESCE(owner_id::text, 'builtin'), name
         ORDER BY id
       ) AS keep_id
FROM exercises;

-- 2. Repoint any references from duplicates to the kept row.
UPDATE workout_exercises t SET exercise_id = m.keep_id
  FROM ex_dedup m WHERE t.exercise_id = m.id AND m.id <> m.keep_id;
UPDATE recommendations t SET exercise_id = m.keep_id
  FROM ex_dedup m WHERE t.exercise_id = m.id AND m.id <> m.keep_id;
UPDATE personal_records t SET exercise_id = m.keep_id
  FROM ex_dedup m WHERE t.exercise_id = m.id AND m.id <> m.keep_id;
UPDATE exercise_goals t SET exercise_id = m.keep_id
  FROM ex_dedup m WHERE t.exercise_id = m.id AND m.id <> m.keep_id;

-- 3. Delete the now-unreferenced duplicates.
DELETE FROM exercises e USING ex_dedup m WHERE e.id = m.id AND m.id <> m.keep_id;

DROP TABLE ex_dedup;

-- 4. Enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS exercises_builtin_name_idx ON exercises (name) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exercises_owner_name_idx ON exercises (owner_id, name) WHERE owner_id IS NOT NULL;
