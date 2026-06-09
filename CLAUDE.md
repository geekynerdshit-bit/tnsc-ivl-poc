# IVL Console Tracker — POC

Geo-Verified NFC tracking system for **Translumina Therapeutics**.
Tracks IVL (Intravascular Lithotripsy) medical consoles across hospitals in India.

## What this POC demonstrates

1. NFC tag works
2. Tag is mapped to an approved location
3. User scans the NFC tag
4. Scan captures the user's GPS location
5. Data is stored and visible
6. Admin can see all scans

## Tech Stack

| Layer    | Technology                     | Hosting         |
|----------|--------------------------------|-----------------|
| Frontend | React + Vite                   | Vercel (free)   |
| Backend  | FastAPI (Python)               | Render (free)   |
| Database | PostgreSQL                     | Supabase (free) |
| Map      | Leaflet + OpenStreetMap        | (no API key)    |
| NFC      | Web NFC API                    | Chrome Android  |
| GPS      | Browser Geolocation API        | built-in        |

## Project Structure

```
tnsc-ivl-poc/
├── CLAUDE.md
├── tasks.md
└── poc-backend/            ← Stage 1 (complete)
    ├── main.py             ← FastAPI app, CORS, request logging middleware
    ├── config.py           ← pydantic-settings, reads .env
    ├── database.py         ← psycopg2 connection context manager
    ├── log_config.py       ← logging setup, get_logger() helper
    ├── models.py           ← Python dataclasses mirroring DB tables
    ├── schemas.py          ← Pydantic request/response schemas
    ├── routes/
    │   ├── consoles.py     ← GET /api/consoles, GET /api/consoles/{id}
    │   └── scans.py        ← POST /api/scan, GET /api/scans, GET /api/stats
    ├── utils/
    │   └── geo.py          ← Haversine distance, geo_status logic
    ├── migrations/
    │   └── 001_init.sql    ← Run once in Supabase SQL Editor
    ├── requirements.txt
    └── .env.example
```

## Running the backend locally

```bash
cd poc-backend
cp .env.example .env      # fill in DATABASE_URL from Supabase
pip install -r requirements.txt
uvicorn main:app --reload
# API docs at http://localhost:8000/docs
```

## Environment Variables

| Variable       | Where to get it                                              |
|----------------|--------------------------------------------------------------|
| DATABASE_URL   | Supabase → Project Settings → Database → URI                 |
| SUPABASE_URL   | Supabase → Project Settings → API → Project URL              |
| SUPABASE_KEY   | Supabase → Project Settings → API → anon/public key          |

**Note:** If your DB password contains special characters (e.g. `@`), URL-encode them in DATABASE_URL (`@` → `%40`).

## Database Schema

### `consoles` (pre-seeded, 10 rows)
Stores NFC tags and their approved GPS locations.

| Column       | Type      | Notes                        |
|--------------|-----------|------------------------------|
| id           | TEXT PK   | IVL-001 … IVL-010            |
| hospital     | TEXT      | real Indian hospital names   |
| approved_lat | FLOAT     | approved GPS latitude        |
| approved_lng | FLOAT     | approved GPS longitude       |
| radius_m     | INT       | allowed radius (default 500m)|
| status       | TEXT      | active / inactive            |

### `scans` (grows with each NFC tap)

| Column      | Type      | Notes                          |
|-------------|-----------|--------------------------------|
| id          | SERIAL PK |                                |
| console_id  | TEXT FK   | references consoles.id         |
| scanned_lat | FLOAT     | GPS from browser               |
| scanned_lng | FLOAT     | GPS from browser               |
| distance_m  | FLOAT     | calculated via Haversine       |
| geo_status  | TEXT      | VERIFIED or OUTSIDE_ZONE       |
| scanned_by  | TEXT      | optional name/mobile           |
| device_info | TEXT      | optional user-agent string     |

## API Endpoints

| Method | Path                    | Purpose                              |
|--------|-------------------------|--------------------------------------|
| GET    | /health                 | Keep-alive ping for Render free tier |
| GET    | /api/consoles           | List all 10 consoles                 |
| GET    | /api/consoles/{id}      | Single console detail (404 if missing)|
| POST   | /api/scan               | Submit NFC tap + GPS, get geo result |
| GET    | /api/scans              | All scans, newest first (filterable) |
| GET    | /api/stats              | Summary counts for dashboard cards  |

## Geo Validation

`utils/geo.py` — Haversine formula, returns distance in metres.
- `distance_m <= radius_m` → `VERIFIED`
- `distance_m > radius_m` → `OUTSIDE_ZONE`

## Seed Data: 10 Consoles

| ID      | Hospital                          | City       |
|---------|-----------------------------------|------------|
| IVL-001 | Apollo Hospital Indraprastha      | New Delhi  |
| IVL-002 | AIIMS New Delhi                   | New Delhi  |
| IVL-003 | Max Super Speciality Hospital     | New Delhi  |
| IVL-004 | Fortis Memorial Research Institute| Gurugram   |
| IVL-005 | Jaypee Hospital                   | Noida      |
| IVL-006 | Apollo Hospitals Bannerghatta Rd  | Bengaluru  |
| IVL-007 | Fortis Malar Hospital             | Chennai    |
| IVL-008 | KIMS Hospitals                    | Hyderabad  |
| IVL-009 | Kokilaben Dhirubhai Ambani Hosp   | Mumbai     |
| IVL-010 | Apollo Hospitals Ahmedabad        | Ahmedabad  |

## Logging

All logs go to stdout in the format:
```
YYYY-MM-DD HH:MM:SS.mmm | LEVEL    | logger_name | message
```
- `INFO` — normal request flow, DB operations, geo results
- `WARNING` — expected failures (404, bad input)
- `ERROR` — unexpected failures (DB down, uncaught exceptions)

`get_logger("name")` from `log_config.py` is used in every module.

## Deployment (when ready)

- **Backend → Render:** connect repo, set env vars, start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Frontend → Vercel:** connect repo, set `VITE_API_BASE_URL` to Render URL
- **UptimeRobot:** ping `GET /health` every 5 min to keep Render free tier warm

---

## Frontend (Stage 2)

- **Framework:** React 18 + Vite
- **Routing:** React Router v6
- **HTTP:** Axios (all calls in `src/api/client.js` only — no `fetch()` elsewhere)
- **Map:** react-leaflet + leaflet (OpenStreetMap, no Mapbox, no API key)
- **Styling:** Plain CSS in `app.css` — no Tailwind, no CSS frameworks
- **Env var:** `VITE_API_BASE_URL` (never hardcoded)
- **Mobile-first** on ScanPage, **desktop-first** on DashboardPage
- Min font 16px on ScanPage, min button height 48px on ScanPage
- **Color scheme:** Navy `#0A1628`, Teal `#00BFA5`, White `#FFFFFF`

### Frontend structure

```
poc-frontend/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
├── .env.local
└── src/
    ├── main.jsx           ← BrowserRouter, Leaflet CSS import
    ├── App.jsx            ← Routes: / and /scan → ScanPage, /dashboard → DashboardPage
    ├── app.css            ← resets + global styles
    ├── api/
    │   └── client.js      ← ALL axios calls live here
    ├── pages/
    │   ├── ScanPage.jsx   ← NFC tag flow: URL param → GPS → submit → result
    │   └── DashboardPage.jsx ← stats + map + scan table, auto-refresh 30s
    └── components/
        ├── NavBar.jsx
        ├── StatsCards.jsx     ← GET /api/stats, 4 summary cards
        ├── ConsoleMap.jsx     ← Leaflet map, console pins + scan markers
        ├── ScanTable.jsx      ← GET /api/scans, recent scans table
        ├── ScanResult.jsx     ← Result card after POST /api/scan
        └── LoadingSpinner.jsx
```

### Frontend commands

```bash
cd poc-frontend
npm install
npm run dev     # port 3000
npm run build
```

### Key rules

- Never hardcode API URL — always use `import.meta.env.VITE_API_BASE_URL`
- Every data-fetching component handles 3 states: loading / success / error
- All API errors caught and shown to user — no silent failures
- `leaflet/dist/leaflet.css` must be imported in `main.jsx` or map breaks

### API field reference (exact names from schemas.py)

**ConsoleResponse:** `id, name, hospital, city, pincode, approved_lat, approved_lng, radius_m, status`

**ScanRequest (POST body):** `console_id, scanned_lat (Optional), scanned_lng (Optional), scanned_by, device_info`

**ScanResponse:** `scan_id, console_id, console_name, hospital, city, scanned_at, scanned_lat, scanned_lng, distance_m, geo_status, scanned_by`
- `geo_status` values: `VERIFIED` | `OUTSIDE_ZONE` | `NO_GPS`
- `scanned_lat`, `scanned_lng`, `distance_m` are Optional (null when GPS denied)
- `distance_readable` does NOT exist — format from `distance_m` in the frontend

**ScanListItem:** `id, console_id, console_name, hospital, city, scanned_at, scanned_lat, scanned_lng, distance_m, geo_status, scanned_by, device_info`

**StatsResponse:** `total_consoles, total_scans, verified_scans, outside_zone_scans, consoles_scanned_today, last_scan_at`

### Scan page tag IDs for testing

Use `IVL-001` through `IVL-010` — these match the seeded consoles.
Example test URL: `http://localhost:3000/scan?tag=IVL-001`
