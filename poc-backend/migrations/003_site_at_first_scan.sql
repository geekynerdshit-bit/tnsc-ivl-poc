-- =============================================================
-- Stage 4: Only console identity (serial/REF/mfg date) is admin-
-- pre-seeded now. Hospital, city, pincode and the approved GPS point
-- are captured from the field on the console's FIRST scan instead of
-- being pre-loaded — relaxes the NOT NULL constraints that assumed
-- every console started out with a known site.
-- Run in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Safe to re-run.
-- =============================================================

ALTER TABLE consoles ALTER COLUMN name         DROP NOT NULL;
ALTER TABLE consoles ALTER COLUMN hospital     DROP NOT NULL;
ALTER TABLE consoles ALTER COLUMN city         DROP NOT NULL;
ALTER TABLE consoles ALTER COLUMN approved_lat DROP NOT NULL;
ALTER TABLE consoles ALTER COLUMN approved_lng DROP NOT NULL;
