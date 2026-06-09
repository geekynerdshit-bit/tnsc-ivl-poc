from fastapi import APIRouter, HTTPException, Query
from database import get_supabase
from schemas import ScanRequest, ScanResponse, ScanListItem, StatsResponse
from utils.geo import calculate_distance, get_geo_status
from log_config import get_logger
from datetime import date, timedelta
from typing import List, Optional

router = APIRouter()
logger = get_logger("routes.scans")


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

    # Insert scan
    insert_result = supabase.table("scans").insert({
        "console_id": scan.console_id,
        "scanned_lat": scan.scanned_lat,
        "scanned_lng": scan.scanned_lng,
        "distance_m": distance,
        "geo_status": geo_status,
        "scanned_by": scan.scanned_by,
        "device_info": scan.device_info,
    }).execute()

    row = insert_result.data[0]
    logger.info("scan saved: id=%s console=%s status=%s", row["id"], scan.console_id, geo_status)

    return ScanResponse(
        scan_id=row["id"],
        console_id=scan.console_id,
        console_name=console["name"],
        hospital=console["hospital"],
        city=console["city"],
        scanned_at=row["scanned_at"],
        scanned_lat=scan.scanned_lat,
        scanned_lng=scan.scanned_lng,
        distance_m=distance,
        geo_status=geo_status,
        scanned_by=scan.scanned_by,
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
    last_scan_at = last_result.data[0]["scanned_at"] if last_result.data else None

    logger.info("stats: total_scans=%d verified=%d outside=%d", total_scans, verified_scans, outside_zone_scans)

    return StatsResponse(
        total_consoles=total_consoles,
        total_scans=total_scans,
        verified_scans=verified_scans,
        outside_zone_scans=outside_zone_scans,
        consoles_scanned_today=consoles_scanned_today,
        last_scan_at=last_scan_at,
    )
