-- =============================================================
-- Stage 1: IVL Console Tracker — Supabase Schema + Seed Data
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================

-- TABLE 1: consoles
-- Pre-loaded NFC tags mapped to approved hospital locations
CREATE TABLE IF NOT EXISTS consoles (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    hospital     TEXT NOT NULL,
    city         TEXT NOT NULL,
    pincode      TEXT,
    approved_lat FLOAT NOT NULL,
    approved_lng FLOAT NOT NULL,
    radius_m     INTEGER DEFAULT 500,
    status       TEXT DEFAULT 'active',
    created_at   TIMESTAMP DEFAULT NOW()
);

-- TABLE 2: scans
-- One row inserted per NFC tag tap
CREATE TABLE IF NOT EXISTS scans (
    id           SERIAL PRIMARY KEY,
    console_id   TEXT REFERENCES consoles(id),
    scanned_at   TIMESTAMP DEFAULT NOW(),
    scanned_lat  FLOAT,
    scanned_lng  FLOAT,
    distance_m   FLOAT,
    geo_status   TEXT,   -- 'VERIFIED' or 'OUTSIDE_ZONE'
    scanned_by   TEXT,
    device_info  TEXT
);

-- =============================================================
-- SEED DATA: 10 IVL Consoles
-- North India (5): Delhi x3, Gurugram, Noida
-- South India (3): Bengaluru, Chennai, Hyderabad
-- West India  (2): Mumbai, Ahmedabad
-- =============================================================

INSERT INTO consoles (id, name, hospital, city, pincode, approved_lat, approved_lng, radius_m) VALUES
-- North India
('IVL-001', 'Console 1', 'Apollo Hospital Indraprastha',          'New Delhi', '110076', 28.5497,  77.2513,  500),
('IVL-002', 'Console 2', 'AIIMS New Delhi',                       'New Delhi', '110029', 28.5672,  77.2100,  500),
('IVL-003', 'Console 3', 'Max Super Speciality Hospital Saket',   'New Delhi', '110017', 28.5275,  77.2060,  500),
('IVL-004', 'Console 4', 'Fortis Memorial Research Institute',    'Gurugram',  '122002', 28.4595,  77.0266,  500),
('IVL-005', 'Console 5', 'Jaypee Hospital',                       'Noida',     '201304', 28.5355,  77.3910,  500),
-- South India
('IVL-006', 'Console 6', 'Apollo Hospitals Bannerghatta Road',    'Bengaluru', '560076', 12.8874,  77.5971,  500),
('IVL-007', 'Console 7', 'Fortis Malar Hospital',                 'Chennai',   '600018', 13.0067,  80.2206,  500),
('IVL-008', 'Console 8', 'KIMS Hospitals',                        'Hyderabad', '500003', 17.4485,  78.3908,  500),
-- West India
('IVL-009', 'Console 9', 'Kokilaben Dhirubhai Ambani Hospital',   'Mumbai',    '400053', 19.1136,  72.8697,  500),
('IVL-010', 'Console 10','Apollo Hospitals Ahmedabad',            'Ahmedabad', '380054', 23.0225,  72.5714,  500)
ON CONFLICT (id) DO NOTHING;
