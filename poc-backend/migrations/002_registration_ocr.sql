-- =============================================================
-- Stage 3: Registration, photo capture, OCR identity verification,
--          and per-visit location detail (room/floor/department)
-- Run in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Safe to re-run (every statement is IF NOT EXISTS / idempotent).
-- =============================================================

-- ---------- consoles: the bound physical identity ----------
-- Populated on FIRST scan (registration). Once set, these are the
-- values every later scan is checked against. Fixed for the life of
-- the console — unlike room/floor below, a serial number doesn't move.
ALTER TABLE consoles ADD COLUMN IF NOT EXISTS serial_number          TEXT;
ALTER TABLE consoles ADD COLUMN IF NOT EXISTS ref_number             TEXT;
ALTER TABLE consoles ADD COLUMN IF NOT EXISTS mfg_date               TEXT;
ALTER TABLE consoles ADD COLUMN IF NOT EXISTS registered_at          TIMESTAMP;
ALTER TABLE consoles ADD COLUMN IF NOT EXISTS registered_by          TEXT;
ALTER TABLE consoles ADD COLUMN IF NOT EXISTS registration_image_url TEXT;

-- ---------- scans: evidence captured at each visit ----------
ALTER TABLE scans ADD COLUMN IF NOT EXISTS scan_type       TEXT;    -- REGISTRATION | VERIFICATION
ALTER TABLE scans ADD COLUMN IF NOT EXISTS image_url       TEXT;

-- What the OCR actually read (kept verbatim, even when corrected)
ALTER TABLE scans ADD COLUMN IF NOT EXISTS ocr_serial      TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS ocr_ref         TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS ocr_mfg_date    TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS ocr_raw_text    TEXT;

-- What the engineer confirmed/submitted (may differ from OCR)
ALTER TABLE scans ADD COLUMN IF NOT EXISTS given_serial    TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS given_ref       TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS given_mfg_date  TEXT;

-- Outcome of comparing the submitted identity against the console record
-- REGISTERED | MATCH | MISMATCH | NO_PHOTO
ALTER TABLE scans ADD COLUMN IF NOT EXISTS identity_status TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- Per-visit location detail — captured fresh on EVERY scan, not fixed on the
-- console. A console can be moved to a different room/floor within the same
-- hospital, which the GPS geo-fence (building-wide radius) cannot detect.
-- The registry reads the most recent scan's values as the "current" location.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS department      TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS floor           TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS room_name       TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS engineer_mobile TEXT;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS notes           TEXT;

CREATE INDEX IF NOT EXISTS idx_scans_console_id  ON scans (console_id);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at  ON scans (scanned_at DESC);

-- ---------- storage bucket for captured photos ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('console-photos', 'console-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "console photos public read" ON storage.objects;
CREATE POLICY "console photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'console-photos');
