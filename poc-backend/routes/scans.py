from fastapi import APIRouter, HTTPException, Query
from database import get_supabase
from schemas import ScanRequest, ScanResponse, ScanListItem, StatsResponse
from utils.geo import calculate_distance, get_geo_status
from utils.storage import upload_photo
from utils.identity import compare, REGISTERED
from log_config import get_logger
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

router = APIRouter()
logger = get_logger("routes.scans")


def normalize_timestamp(value):
    """Supabase returns naive timestamps; treat them as UTC so the frontend's
    Date math (relative time, sorting) is correct regardless of viewer timezone."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return value


# OCR runs entirely in the browser now (Tesseract.js, see poc-frontend's
# src/utils/tesseractOcr.js) — no server-side OCR endpoint, no Google Cloud
# dependency, no API key. The backend still receives and stores whatever the
# client-side OCR read (ocr_serial/ocr_ref/ocr_mfg_date/ocr_raw_text on
# ScanRequest below) purely as an audit record of what was detected.

# Every field is mandatory except notes — this is the audit record for a real
# medical asset, not a casual form. Enforced here too, not just in the
# frontend, so the API rejects an incomplete visit regardless of caller (a
# future mobile app, a direct API call, a stale frontend build).
_REQUIRED_FIELDS = [
    ("image_base64", "console photo"),
    ("given_serial", "serial number"),
    ("given_ref", "REF number"),
    ("given_mfg_date", "manufacturing date"),
    ("department", "department"),
    ("floor", "floor"),
    ("room_name", "room"),
    ("scanned_by", "engineer name"),
    ("engineer_mobile", "mobile number"),
]


def _require_fields(scan: ScanRequest) -> None:
    missing = [label for attr, label in _REQUIRED_FIELDS if not (getattr(scan, attr) or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")


@router.post("/scan", response_model=ScanResponse)
def submit_scan(scan: ScanRequest):
    logger.info("scan request: console=%s lat=%s lng=%s by=%s",
                scan.console_id, scan.scanned_lat, scan.scanned_lng, scan.scanned_by or "anonymous")

    supabase = get_supabase()

    # Look up console
    result = supabase.table("consoles").select("*").eq("id", scan.console_id).execute()
    if not result.data:
        logger.warning("scan rejected — console not found: %s", scan.console_id)
        raise HTTPException(status_code=404, detail=f"Console '{scan.console_id}' not found")
    console = result.data[0]

    _require_fields(scan)

    # Calculate distance or mark NO_GPS
    if scan.scanned_lat is None or scan.scanned_lng is None:
        distance = None
        geo_status = "NO_GPS"
        logger.info("geo check: no GPS coordinates — status=NO_GPS")
    else:
        distance = calculate_distance(
            scan.scanned_lat, scan.scanned_lng,
            console["approved_lat"], console["approved_lng"]
        )
        geo_status = get_geo_status(distance, console["radius_m"])
        logger.info("geo check: distance=%.1fm radius=%dm status=%s",
                    distance, console["radius_m"], geo_status)

    # ---- identity: register on first visit, verify on every later one ----
    known_serial = console.get("serial_number")
    known_mfg = console.get("mfg_date")

    given_serial = (scan.given_serial or "").strip() or None
    given_ref = (scan.given_ref or "").strip() or None
    given_mfg = (scan.given_mfg_date or "").strip() or None

    verdict = compare(console, given_serial, given_mfg)
    identity_status = verdict["status"]
    scan_type = "REGISTRATION" if verdict["is_registration"] else "VERIFICATION"

    if verdict["mismatched"] and not (scan.override_reason or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Identity does not match the record — a mismatch explanation is required.",
        )

    # An engineer submitting values that differ from what OCR read is an
    # explicit manual correction, and is recorded as such.
    manual_override = bool(
        (given_serial and scan.ocr_serial and given_serial != scan.ocr_serial)
        or (given_mfg and scan.ocr_mfg_date and given_mfg != scan.ocr_mfg_date)
        or (given_serial and not scan.ocr_serial)
    )

    logger.info("identity: type=%s status=%s mismatched=%s override=%s",
                scan_type, identity_status, verdict["mismatched"], manual_override)

    # Store the photo. A storage failure must not lose the scan — the GPS
    # evidence is the primary record.
    image_url = upload_photo(scan.console_id, scan.image_base64) if scan.image_base64 else None

    insert_result = supabase.table("scans").insert({
        "console_id": scan.console_id,
        "scanned_lat": scan.scanned_lat,
        "scanned_lng": scan.scanned_lng,
        "distance_m": distance,
        "geo_status": geo_status,
        "scanned_by": scan.scanned_by,
        "device_info": scan.device_info,
        "scan_type": scan_type,
        "image_url": image_url,
        "ocr_serial": scan.ocr_serial,
        "ocr_ref": scan.ocr_ref,
        "ocr_mfg_date": scan.ocr_mfg_date,
        "ocr_raw_text": (scan.ocr_raw_text or "")[:4000] or None,
        "given_serial": given_serial,
        "given_ref": given_ref,
        "given_mfg_date": given_mfg,
        "identity_status": identity_status,
        "manual_override": manual_override,
        "override_reason": (scan.override_reason or "").strip() or None,
        "department": (scan.department or "").strip() or None,
        "floor": (scan.floor or "").strip() or None,
        "room_name": (scan.room_name or "").strip() or None,
        "engineer_mobile": (scan.engineer_mobile or "").strip() or None,
        "notes": (scan.notes or "").strip() or None,
    }).execute()

    row = insert_result.data[0]
    logger.info("scan saved: id=%s console=%s geo=%s identity=%s",
                row["id"], scan.console_id, geo_status, identity_status)

    # Bind the physical identity to the tag on successful registration only.
    # A MISMATCH never overwrites the record — that is a human decision.
    if identity_status == REGISTERED:
        supabase.table("consoles").update({
            "serial_number": given_serial,
            "ref_number": given_ref,
            "mfg_date": given_mfg,
            "registered_at": normalize_timestamp(row["scanned_at"]).isoformat(),
            "registered_by": scan.scanned_by,
            "registration_image_url": image_url,
        }).eq("id", scan.console_id).execute()
        logger.info("console %s registered: serial=%s mfg=%s",
                    scan.console_id, given_serial, given_mfg)

    return ScanResponse(
        scan_id=row["id"],
        console_id=scan.console_id,
        console_name=console["name"],
        hospital=console["hospital"],
        city=console["city"],
        scanned_at=normalize_timestamp(row["scanned_at"]),
        scanned_lat=scan.scanned_lat,
        scanned_lng=scan.scanned_lng,
        distance_m=distance,
        geo_status=geo_status,
        scanned_by=scan.scanned_by,
        scan_type=scan_type,
        identity_status=identity_status,
        mismatched_fields=verdict["mismatched"],
        image_url=image_url,
        given_serial=given_serial,
        given_mfg_date=given_mfg,
        known_serial=known_serial,
        known_mfg_date=known_mfg,
        manual_override=manual_override,
        department=scan.department,
        floor=scan.floor,
        room_name=scan.room_name,
        engineer_mobile=scan.engineer_mobile,
        notes=scan.notes,
    )


@router.get("/scans", response_model=List[ScanListItem])
def get_all_scans(
    console_id: Optional[str] = Query(None),
    geo_status: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    supabase = get_supabase()

    query = (
        supabase.table("scans")
        .select("*, consoles(name, hospital, city)")
        .order("scanned_at", desc=True)
        .limit(limit)
    )
    if console_id:
        query = query.eq("console_id", console_id)
    if geo_status:
        query = query.eq("geo_status", geo_status)

    result = query.execute()

    # Flatten nested consoles join into top-level fields
    rows = []
    for row in result.data:
        console_info = row.pop("consoles", None) or {}
        row["console_name"] = console_info.get("name")
        row["hospital"] = console_info.get("hospital")
        row["city"] = console_info.get("city")
        row["scanned_at"] = normalize_timestamp(row.get("scanned_at"))
        rows.append(row)

    logger.info("returned %d scans", len(rows))
    return rows


@router.get("/stats", response_model=StatsResponse)
def get_stats():
    supabase = get_supabase()

    total_consoles = (supabase.table("consoles").select("*", count="exact").execute().count or 0)
    total_scans = (supabase.table("scans").select("*", count="exact").execute().count or 0)
    verified_scans = (supabase.table("scans").select("*", count="exact").eq("geo_status", "VERIFIED").execute().count or 0)
    outside_zone_scans = (supabase.table("scans").select("*", count="exact").eq("geo_status", "OUTSIDE_ZONE").execute().count or 0)

    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    today_rows = supabase.table("scans").select("console_id").gte("scanned_at", today).lt("scanned_at", tomorrow).execute()
    consoles_scanned_today = len(set(r["console_id"] for r in today_rows.data))

    last_result = supabase.table("scans").select("scanned_at").order("scanned_at", desc=True).limit(1).execute()
    last_scan_at = normalize_timestamp(last_result.data[0]["scanned_at"]) if last_result.data else None

    # Registration/identity counters depend on migration 002. Report them as 0
    # when those columns are absent rather than failing the whole endpoint —
    # the dashboard must keep working on an un-migrated database.
    try:
        registered_consoles = (
            supabase.table("consoles").select("*", count="exact")
            .not_.is_("serial_number", "null").execute().count or 0
        )
        identity_mismatches = (
            supabase.table("scans").select("*", count="exact")
            .eq("identity_status", "MISMATCH").execute().count or 0
        )
    except Exception as exc:
        logger.warning("identity stats unavailable (migration 002 not applied?): %s", exc)
        registered_consoles = 0
        identity_mismatches = 0

    logger.info("stats: total_scans=%d verified=%d outside=%d registered=%d mismatches=%d",
                total_scans, verified_scans, outside_zone_scans, registered_consoles, identity_mismatches)

    return StatsResponse(
        total_consoles=total_consoles,
        total_scans=total_scans,
        verified_scans=verified_scans,
        outside_zone_scans=outside_zone_scans,
        consoles_scanned_today=consoles_scanned_today,
        last_scan_at=last_scan_at,
        registered_consoles=registered_consoles,
        identity_mismatches=identity_mismatches,
    )
