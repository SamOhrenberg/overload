-- Custom barbell/dumbbell/machine exercises created without a load step were
-- treated as bodyweight by the workout logger (no weight field). Loaded
-- exercises now always carry a step; back-fill the unit default (2.5 kg / 5 lb).

UPDATE exercises
SET load_increment = CASE WHEN unit = 'kg' THEN 2.5 ELSE 5 END
WHERE owner_id IS NOT NULL
  AND load_increment IS NULL
  AND modality IN ('barbell', 'dumbbell', 'machine')
  AND kind <> 'cardio';
