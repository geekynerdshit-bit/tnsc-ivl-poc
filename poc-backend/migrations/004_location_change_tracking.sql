-- =============================================================
-- Stage 5: Flag + record department/floor/room changes between visits.
-- Site detail is now pre-filled in the UI from the console's last known
-- location (convenience, since most visits are to the same room) — this
-- is what makes an actual edit away from that pre-fill meaningful: it's
-- a deliberate signal the console was physically moved, and needs to be
-- a visible, auditable event rather than blending into routine per-visit
-- data. The comparison + prev_* capture happens server-side at scan time
-- (routes/scans.py), so this is a permanent record of what changed, not
-- something recomputed later by diffing rows (which breaks if any row is
-- ever deleted).
-- Run in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Safe to re-run.
-- =============================================================

ALTER TABLE scans ADD COLUMN IF NOT EXISTS location_changed BOOLEAN DEFAULT FALSE;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS prev_department   TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS prev_floor        TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS prev_room_name    TEXT;
