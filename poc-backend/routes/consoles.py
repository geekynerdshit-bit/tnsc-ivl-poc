from fastapi import APIRouter, HTTPException
from database import get_supabase
from schemas import ConsoleResponse, SiteUpdateRequest
from config import settings
from log_config import get_logger
from typing import List, Optional

router = APIRouter()
logger = get_logger("routes.consoles")


def _latest_locations(supabase, console_ids: Optional[List[str]] = None) -> dict:
    """
    Most recent department/floor/room per console, from the scans table.

    Room/floor are captured fresh on every visit rather than fixed on the
    console record (a console can move between rooms within the same
    hospital, which the GPS geo-fence cannot see) — this is what turns that
    per-visit history into a single "current location" per console.

    Returns {} on a database that hasn't run migration 002 yet, rather than
    failing the whole consoles endpoint over a missing column.
    """
    try:
        query = (
            supabase.table("scans")
            .select("console_id,department,floor,room_name,scanned_at")
            .order("scanned_at", desc=True)
        )
        if console_ids:
            query = query.in_("console_id", console_ids)
        result = query.execute()
    except Exception as exc:
        logger.warning("current-location lookup unavailable (migration 002 not applied?): %s", exc)
        return {}

    latest = {}
    for row in result.data:
        cid = row["console_id"]
        if cid not in latest:  # first hit per console = most recent, given desc order
            latest[cid] = row
    return latest


def _enrich(row: dict, location: Optional[dict]) -> dict:
    row = dict(row)
    row["is_registered"] = bool(row.get("serial_number"))
    row["is_site_registered"] = bool(row.get("hospital"))
    row["current_department"] = (location or {}).get("department")
    row["current_floor"] = (location or {}).get("floor")
    row["current_room"] = (location or {}).get("room_name")
    return row


@router.get("/consoles", response_model=List[ConsoleResponse])
def get_all_consoles():
    supabase = get_supabase()
    result = supabase.table("consoles").select("*").order("id").execute()
    locations = _latest_locations(supabase, [r["id"] for r in result.data])
    rows = [_enrich(r, locations.get(r["id"])) for r in result.data]
    logger.info("fetched %d consoles (%d registered)",
                len(rows), sum(1 for r in rows if r["is_registered"]))
    return rows


@router.get("/consoles/{console_id}", response_model=ConsoleResponse)
def get_console(console_id: str):
    supabase = get_supabase()
    result = supabase.table("consoles").select("*").eq("id", console_id).execute()
    if not result.data:
        logger.warning("console not found: %s", console_id)
        raise HTTPException(status_code=404, detail=f"Console '{console_id}' not found")

    locations = _latest_locations(supabase, [console_id])
    row = _enrich(result.data[0], locations.get(console_id))
    logger.info("fetched console %s (%s) registered=%s",
                console_id, row["hospital"], row["is_registered"])
    return row


@router.patch("/consoles/{console_id}/site", response_model=ConsoleResponse)
def update_console_site(console_id: str, body: SiteUpdateRequest):
    """
    Admin-only: re-register a console's approved site (hospital/city/pincode
    + approved GPS point). This is the one place a hospital or approved
    location can be overwritten after it's first set — every other path
    (submit_scan) deliberately only sets it once and flags any later
    disagreement instead of touching it, so a stray or mistaken visit can
    never silently relocate a console's master record.

    Passcode-gated because this backend has no auth of its own otherwise —
    the dashboard's Vercel passcode only protects the SPA's page routes, not
    this Render-hosted API, whose URL is visible to anyone via the browser's
    network tab (it's a public VITE_ env var). Without this check, that URL
    alone would be enough for anyone to relocate any console.
    """
    if not settings.ADMIN_PASSCODE:
        raise HTTPException(status_code=503, detail="Admin actions are not configured.")
    if body.passcode != settings.ADMIN_PASSCODE:
        logger.warning("site update rejected — bad passcode for console %s", console_id)
        raise HTTPException(status_code=403, detail="Incorrect passcode.")

    supabase = get_supabase()
    existing = supabase.table("consoles").select("id").eq("id", console_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail=f"Console '{console_id}' not found")

    update = {
        "hospital": body.hospital.strip(),
        "city": body.city.strip(),
        "pincode": (body.pincode or "").strip() or None,
        "status": "active",
    }
    if body.approved_lat is not None and body.approved_lng is not None:
        update["approved_lat"] = body.approved_lat
        update["approved_lng"] = body.approved_lng

    supabase.table("consoles").update(update).eq("id", console_id).execute()
    logger.info("console %s site re-registered by admin: %s", console_id, update)

    result = supabase.table("consoles").select("*").eq("id", console_id).execute()
    locations = _latest_locations(supabase, [console_id])
    return _enrich(result.data[0], locations.get(console_id))
