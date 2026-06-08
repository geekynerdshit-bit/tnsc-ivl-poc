# IVL Console Tracker — Task Board

Client: Translumina Therapeutics
Goal: Demo geo-verified NFC console tracking to Nishant

---

## Stage 1 — Backend + Database
**Status: COMPLETE**

- [x] Create Supabase project
- [x] Run `migrations/001_init.sql` in Supabase SQL Editor
- [x] Seed 10 consoles (North/South/West India hospitals)
- [x] FastAPI project structure (`routes/`, `utils/`, `schemas.py`)
- [x] `GET /health` — returns ok
- [x] `GET /api/consoles` — returns all 10 consoles
- [x] `GET /api/consoles/{id}` — single console, 404 if missing
- [x] `POST /api/scan` — Haversine distance, VERIFIED / OUTSIDE_ZONE, inserts row
- [x] `GET /api/scans` — all scans newest first, filterable
- [x] `GET /api/stats` — summary counts
- [x] CORS open for POC (`allow_origins=["*"]`)
- [x] Structured logging (timestamp, level, module, message, request timing)
- [x] All endpoints tested via `/docs`

---

## Stage 2 — React Frontend
**Status: NOT STARTED — waiting for Stage 1 sign-off**

- [ ] Scaffold React + Vite project (`poc-frontend/`)
- [ ] `/scan` page
  - [ ] Read `?tag=IVL-001` from URL param
  - [ ] Capture GPS via Browser Geolocation API
  - [ ] `POST /api/scan` with console_id + coordinates
  - [ ] Show result card: VERIFIED (green) / OUTSIDE_ZONE (red)
  - [ ] Show console name, hospital, distance, timestamp
- [ ] `/dashboard` page
  - [ ] Summary cards from `GET /api/stats`
  - [ ] Leaflet map (OpenStreetMap) with scan pins
  - [ ] Pins coloured green (VERIFIED) / red (OUTSIDE_ZONE)
  - [ ] Table of recent scans from `GET /api/scans`
- [ ] Wire `VITE_API_URL` env var pointing to backend
- [ ] Deploy to Vercel

---

## Stage 3 — NFC Integration
**Status: NOT STARTED**

- [ ] Web NFC API on `/scan` page (Chrome Android only)
- [ ] Tap NFC tag → browser opens `/scan?tag=IVL-001`
- [ ] Page reads tag ID from URL, no manual entry needed
- [ ] Test on physical Android device with Chrome
- [ ] Write NFC tag IDs to physical tags (IVL-001 … IVL-010)

---

## Stage 4 — Demo Polish
**Status: NOT STARTED**

- [ ] QR code fallback for iPhone users (links to `/scan?tag=IVL-XXX`)
- [ ] Loading states (GPS acquiring, submitting scan)
- [ ] Error handling (GPS denied, console not found, network offline)
- [ ] UptimeRobot ping on `GET /health` every 5 min (keep Render warm)
- [ ] Demo run-through with Nishant
  1. Tap NFC tag on Android
  2. See location captured
  3. See VERIFIED / OUTSIDE_ZONE
  4. Watch dashboard update
  5. Show raw data in Supabase table viewer

---

## Definition of Done (full POC)

Nishant can:
1. Pick up a physical NFC tag
2. Tap his Android phone to it
3. See his location captured on screen
4. See VERIFIED or OUTSIDE_ZONE
5. Watch the dashboard update in real time
6. See the raw scan row in Supabase table viewer
