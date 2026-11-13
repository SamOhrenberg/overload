-- Speed zones for running: a cardio bout can be broken into Walk/Jog/Sprint
-- segments so jog endurance and sprint intervals are tracked and progressed
-- separately within the one "Running" exercise.

-- Per-bout labelled segments: [{ zone, durationSec, distance?, paceSec? }, ...].
ALTER TABLE cardio_bouts ADD COLUMN IF NOT EXISTS segments jsonb;

-- Opt-in flag: which exercises use the zoned (Walk/Jog/Sprint) logger + engine.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS tracks_speed_zones boolean NOT NULL DEFAULT false;

-- Turn it on for the built-in Running exercise.
UPDATE exercises SET tracks_speed_zones = true WHERE owner_id IS NULL AND name = 'Running';
