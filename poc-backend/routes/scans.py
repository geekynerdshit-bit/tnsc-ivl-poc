from fastapi import APIRouter, HTTPException, Query
from database import get_supabase
from schemas import ScanRequest, ScanResponse, ScanListItem, StatsResponse
from utils.geo import calculate_distance, get_geo_status
from utils.storage import upload_photo
from utils.identity import compare, canonical, REGISTERED
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


# Photo capture + OCR are shelved for now (accuracy on real hospital-network
# photos wasn't reliable enough yet — see poc-frontend's tesseractOcr.js).
# Identity (serial/REF/mfg date) is instead pre-seeded directly on the
# console record by an admin and simply echoed back on every scan below,
# rather than captured from the engineer each visit. The ScanRequest/compare()
# plumbing for photo evidence and mismatch detection is left in place (not
# deleted) so this can be re-enabled later without rebuilding it.

# Every field is mandatory except notes — this is the audit record for a real
# medical asset, not a casual form. Enforced here too, not just in the
# frontend, so the API rejects an incomplete visit regardless of caller (a
# future mobile app, a direct API call, a stale frontend build).
_REQUIRED_FIELDS = [
    ("hospital", "hospital name"),
    ("department", "department"),
    ("floor", "floor"),
    ("scanned_by", "engineer name"),
    ("engineer_mobile", "mobile number"),
]

# Only asked once per console — on the first scan, when no site is on file
# yet. Not required on later visits, since city/pincode are fixed once set.
# Hospital name, unlike these, is re-asked on every visit — see
# _REQUIRED_FIELDS above — because it's the one piece of site detail that
# can genuinely change (a relocation to a different hospital entirely).
_SITE_REQUIRED_FIELDS = [
    ("city", "city"),
]


def _require_fields(scan: ScanRequest, is_site_registered: bool) -> None:
    missing = [label for attr, label in _REQUIRED_FIELDS if not (getattr(scan, attr) or "").strip()]
    if not is_site_registered:
        missing += [label for attr, label in _SITE_REQUIRED_FIELDS if not (getattr(scan, attr) or "").strip()]
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

    is_site_registered = bool(console.get("hospital"))
    has_geo_baseline = console.get("approved_lat") is not None and console.get("approved_lng") is not None

    _require_fields(scan, is_site_registered)

    # ---- hospital verification ---------------------------------------------
    # Hospital name is re-entered every visit (unlike city/pincode, which are
    # only asked once). On the first scan there's nothing to compare against
    # yet — it simply becomes the record. On every later scan, a name that
    # doesn't match is flagged, same "never silently overwrite" rule as
    # identity: only the admin-only PATCH /api/consoles/{id}/site endpoint
    # can actually re-register a console's hospital.
    known_hospital = console.get("hospital")
    given_hospital = (scan.hospital or "").strip() or None
    hospital_mismatch = bool(
        is_site_registered and given_hospital and canonical(given_hospital) != canonical(known_hospital)
    )
    if hospital_mismatch:
        logger.info("hospital mismatch for %s: on record=%r, entered=%r",
                     scan.console_id, known_hospital, given_hospital)

    # Calculate distance against the approved point, or — if this console has
    # no approved point yet (first scan, or an earlier scan that lost GPS
    # before one could be set) — this scan's GPS becomes that point.
    if has_geo_baseline:
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
    elif scan.scanned_lat is not None and scan.scanned_lng is not None:
        distance = 0.0
        geo_status = "VERIFIED"
        logger.info("geo check: no approved point on file yet — this scan sets it")
    else:
        distance = None
        geo_status = "NO_GPS"
        logger.info("geo check: no GPS coordinates and no approved point on file — status=NO_GPS")

    # A hospital-name mismatch overrides whatever GPS concluded — the console
    # is reporting itself somewhere it isn't supposed to be, and a coincidental
    # GPS pass (two hospitals near each other, GPS drift) must not mask that.
    if hospital_mismatch and geo_status == "VERIFIED":
        geo_status = "OUTSIDE_ZONE"
        logger.info("geo status overridden to OUTSIDE_ZONE by hospital mismatch")

    # ---- identity: pre-seeded on the console record by an admin, not      --
    # ---- captured from the engineer (photo/OCR capture is shelved for now)--
    known_serial = console.get("serial_number")
    known_ref = console.get("ref_number")
    known_mfg = console.get("mfg_date")

    # Client-submitted given_* (from the old photo/OCR flow) still wins if
    # ever sent, so this keeps working unchanged once that flow returns.
    given_serial = (scan.given_serial or "").strip() or known_serial
    given_ref = (scan.given_ref or "").strip() or known_ref
    given_mfg = (scan.given_mfg_date or "").strip() or known_mfg

    verdict = compare(console, given_serial, given_mfg)
    identity_status = verdict["status"]
    scan_type = "REGISTRATION" if verdict["is_registration"] else "VERIFICATION"

    if (verdict["mismatched"] or hospital_mismatch) and not (scan.override_reason or "").strip():
        detail = (
            "Hospital does not match the record — a mismatch explanation is required."
            if hospital_mismatch and not verdict["mismatched"]
            else "Identity does not match the record — a mismatch explanation is required."
        )
        raise HTTPException(status_code=400, detail=detail)

    # An engineer submitting values that differ from what OCR read is an
    # explicit manual correction. Only meaningful when OCR actually ran —
    # with OCR shelved, ocr_serial/ocr_mfg_date are always empty and this is
    # always False (given_* being pre-filled from the console record is the
    # normal case now, not a correction).
    manual_override = bool(
        (scan.ocr_serial and given_serial and given_serial != scan.ocr_serial)
        or (scan.ocr_mfg_date and given_mfg and given_mfg != scan.ocr_mfg_date)
    )

    logger.info("identity: type=%s status=%s mismatched=%s override=%s",
                scan_type, identity_status, verdict["mismatched"], manual_override)

    given_department = (scan.department or "").strip() or None
    given_floor = (scan.floor or "").strip() or None
    given_room = (scan.room_name or "").strip() or None

    # ---- location-change detection ----------------------------------------
    # Department/floor/room are pre-filled in the UI from the console's
    # previous visit, so a submitted value that differs from that previous
    # visit is a deliberate edit — a real signal the console was physically
    # moved. Captured here, at write time, as a permanent record of what it
    # changed FROM, so the dashboard can show it without depending on the
    # previous scan row still existing.
    prev_result = (
        supabase.table("scans")
        .select("department,floor,room_name")
        .eq("console_id", scan.console_id)
        .order("scanned_at", desc=True)
        .limit(1)
        .execute()
    )
    prev_location = prev_result.data[0] if prev_result.data else None

    location_changed = False
    prev_department = prev_floor = prev_room_name = None
    if prev_location is not None:
        location_changed = (
            prev_location.get("department") != given_department
            or prev_location.get("floor") != given_floor
            or prev_location.get("room_name") != given_room
        )
        if location_changed:
            prev_department = prev_location.get("department")
            prev_floor = prev_location.get("floor")
            prev_room_name = prev_location.get("room_name")
            logger.info(
                "location changed for %s: dept %r->%r, floor %r->%r, room %r->%r",
                scan.console_id, prev_department, given_department,
                prev_floor, given_floor, prev_room_name, given_room,
            )

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
        "given_hospital": given_hospital,
        "hospital_mismatch": hospital_mismatch,
        "department": given_department,
        "floor": given_floor,
        "room_name": given_room,
        "engineer_mobile": (scan.engineer_mobile or "").strip() or None,
        "notes": (scan.notes or "").strip() or None,
        "location_changed": location_changed,
        "prev_department": prev_department,
        "prev_floor": prev_floor,
        "prev_room_name": prev_room_name,
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

    # Bind the site (hospital/city/pincode + approved GPS) the first time
    # either is missing. Once set, never overwritten by a later scan — a
    # console's site is fixed the same way its identity is.
    console_update = {}
    resolved_hospital = console.get("hospital")
    resolved_city = console.get("city")
    if not is_site_registered:
        resolved_hospital = given_hospital or ""
        resolved_city = (scan.city or "").strip()
        console_update.update({
            "hospital": resolved_hospital,
            "city": resolved_city,
            "pincode": (scan.pincode or "").strip() or None,
            "status": "active",
        })
    if not has_geo_baseline and scan.scanned_lat is not None and scan.scanned_lng is not None:
        console_update["approved_lat"] = scan.scanned_lat
        console_update["approved_lng"] = scan.scanned_lng
    if console_update:
        supabase.table("consoles").update(console_update).eq("id", scan.console_id).execute()
        logger.info("console %s site updated: %s", scan.console_id, list(console_update.keys()))

    return ScanResponse(
        scan_id=row["id"],
        console_id=scan.console_id,
        console_name=console.get("name") or scan.console_id,
        hospital=resolved_hospital,
        city=resolved_city,
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
        given_hospital=given_hospital,
        known_hospital=known_hospital,
        hospital_mismatch=hospital_mismatch,
        department=given_department,
        floor=given_floor,
        room_name=given_room,
        engineer_mobile=scan.engineer_mobile,
        notes=scan.notes,
        location_changed=location_changed,
        prev_department=prev_department,
        prev_floor=prev_floor,
        prev_room_name=prev_room_name,
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
