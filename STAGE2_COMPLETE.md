# Stage 2 Complete

## What was built

### Backend changes (required for Stage 2)
- `ScanRequest.scanned_lat/lng` made Optional — backend now accepts null GPS coordinates
- `ScanResponse/ScanListItem.scanned_lat/lng/distance_m` made Optional
- New `geo_status` value `NO_GPS` — when GPS is denied, scan is recorded without location verification

### Frontend — poc-frontend/

| File | Purpose |
|------|---------|
| `src/main.jsx` | BrowserRouter entry point, Leaflet CSS import |
| `src/App.jsx` | Routes: `/` → redirect, `/scan` → ScanPage, `/dashboard` → DashboardPage |
| `src/app.css` | Global resets |
| `src/api/client.js` | All axios calls: getConsoles, getConsole, submitScan, getScans, getStats |
| `src/components/NavBar.jsx` | Navy top bar, IVL Console POC link, Dashboard + Scan links |
| `src/components/LoadingSpinner.jsx` | Teal spinner with optional message |
| `src/pages/ScanPage.jsx` | Full NFC scan flow: URL param → console lookup → GPS capture → submit → result |
| `src/components/ScanResult.jsx` | Result card: VERIFIED (green) / OUTSIDE_ZONE (red) / NO_GPS (amber) |
| `src/pages/DashboardPage.jsx` | Stats + map + scan table, auto-refresh every 30s with live counter |
| `src/components/StatsCards.jsx` | 4-card grid from GET /api/stats |
| `src/components/ConsoleMap.jsx` | Leaflet map centered on India, console pins + scan markers |
| `src/components/ScanTable.jsx` | Recent scans table, status badges, mobile-responsive |

## How to run

**Terminal 1 — backend:**
```bash
cd poc-backend
uvicorn main:app --reload
# Runs on http://localhost:8000
# API docs at http://localhost:8000/docs
```

**Terminal 2 — frontend:**
```bash
cd poc-frontend
npm run dev
# Runs on http://localhost:3000
```

## Manual tests to run

Open Chrome DevTools as needed.

### Test A — No tag param
URL: `http://localhost:3000/scan`
Expected: "No Console Tag Detected" card with hint to add `?tag=IVL-001`

### Test B — Invalid tag (404)
URL: `http://localhost:3000/scan?tag=IVL-FAKE`
Expected: Red "Console Not Found" error card showing the bad tag ID

### Test C — Valid tag, GPS denied (NO_GPS)
URL: `http://localhost:3000/scan?tag=IVL-001`
- When GPS prompt appears: **Deny** location
- Expected: Amber warning box "Location access denied"
- Enter name, click "Record Scan ✓"
- Expected: ScanResult with amber 📍 icon, "Scan Recorded", NO GPS badge

### Test D — Valid tag, GPS allowed
URL: `http://localhost:3000/scan?tag=IVL-001`
- Allow GPS when prompted
- Click "Record Scan ✓"
- Expected: ScanResult with VERIFIED or OUTSIDE_ZONE depending on your actual location vs Apollo Delhi coords

### Test E — OUTSIDE_ZONE simulation
URL: `http://localhost:3000/scan?tag=IVL-001`
1. Chrome DevTools → More tools → Sensors → Location
2. Set: Latitude `19.0760`, Longitude `72.8777` (Mumbai)
3. Reload page, allow GPS
4. Expected: OUTSIDE_ZONE — distance ≈ 1,148 km

### Test F — Stats cards
URL: `http://localhost:3000/dashboard`
Expected: 4 cards showing total_consoles=10, plus scan counts from Tests C/D/E

### Test G — Map
URL: `http://localhost:3000/dashboard`
Expected: India map with 10 blue console pins, green/red circle markers from scans

### Test H — Scan table
URL: `http://localhost:3000/dashboard`
Expected: Rows for each test scan, correct VERIFIED/OUTSIDE ZONE/NO GPS badges

### Test I — Auto-refresh
Wait 31s on dashboard — "Last updated: 0s ago" resets, data silently refreshes

### Test J — Mobile layout (DevTools)
DevTools → Toggle Device Toolbar → iPhone 14 Pro (390px)
- ScanPage: buttons 48px+ tall, text 16px+, comfortable for thumbs
- Dashboard: stat cards wrap to 2×2 grid, table scrolls horizontally, Hospital/Distance columns hidden

## Build verification (automated, already run)
```
✓ 138 modules transformed
✓ dist/index.html     0.40 kB
✓ dist/assets/*.js  382.13 kB
✓ Build time: 816ms
✓ Dev server: ready in 194ms
```

## Next: Stage 3
Web NFC API integration — physical NFC tag tap auto-opens
`/scan?tag=IVL-001` without any manual URL entry.
Chrome Android only. Requires NDEFReader API.

**Do not start Stage 3 until confirmed.**
