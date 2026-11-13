-- Extend speed-zone tracking to the other steady-state cardio where effort
-- zones make sense. Labels shift to Easy/Tempo/Sprint in the UI; the underlying
-- zones and progression (tempo base + sprint intervals) are the same.
UPDATE exercises
SET tracks_speed_zones = true
WHERE owner_id IS NULL AND name IN ('Cycling', 'Rowing');
