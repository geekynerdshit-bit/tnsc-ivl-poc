-- =============================================================
-- Stage 6: Hospital name is now re-entered on EVERY visit (not just the
-- first), so a real relocation to a different hospital is caught as a
-- signal independent of GPS — and given a way to actually be resolved,
-- which didn't exist for any kind of mismatch before this.
--
-- Same "flag it, never silently overwrite" pattern as identity mismatch:
-- a hospital-name mismatch never auto-updates consoles.hospital. Only an
-- explicit admin action (PATCH /api/consoles/{id}/site, passcode-gated)
-- re-registers a console's approved site.
-- Run in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Safe to re-run.
-- =============================================================

ALTER TABLE scans ADD COLUMN IF NOT EXISTS given_hospital     TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS hospital_mismatch  BOOLEAN DEFAULT FALSE;
