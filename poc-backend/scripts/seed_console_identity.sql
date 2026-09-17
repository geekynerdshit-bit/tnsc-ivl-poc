-- =============================================================
-- Admin seed: console PHYSICAL IDENTITY only (serial/REF/mfg date).
-- Hospital/city/pincode/approved GPS are intentionally left untouched —
-- for a console that already has site data (from earlier manual testing)
-- that stays as-is; for one that doesn't yet, it's captured from the
-- field on its first scan (see migration 003_site_at_first_scan.sql,
-- which must be run first).
--
-- ASSUMPTION: the 4 rows below are mapped to IVL-001..IVL-004 in the
-- order the reference photos were taken. Check the current /api/consoles
-- listing and edit the console_id in each row if that mapping is wrong.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Safe to re-run (idempotent upsert on id, identity columns only).
-- =============================================================

INSERT INTO consoles (id, serial_number, ref_number, mfg_date)
VALUES
  ('IVL-001', '53941', '825Dx', '2024-08'),
  ('IVL-002', '47878', '825D',  '2023-06'),
  ('IVL-003', '46893', '825D',  '2022-08'),
  ('IVL-004', '47074', '825D',  '2022-09')
ON CONFLICT (id) DO UPDATE SET
  serial_number = EXCLUDED.serial_number,
  ref_number    = EXCLUDED.ref_number,
  mfg_date      = EXCLUDED.mfg_date;

-- Note: IVL-003 and IVL-004 currently still hold the original fictitious
-- demo hospitals from migration 001 (Apollo Hospital Indraprastha / AIIMS
-- New Delhi). This script does not touch that — if you want either of
-- those two to actually exercise the new "Register site on first scan"
-- flow, clear its site fields yourself first:
--   UPDATE consoles SET hospital = NULL, city = NULL, pincode = NULL,
--     approved_lat = NULL, approved_lng = NULL, status = NULL
--   WHERE id = 'IVL-003';
