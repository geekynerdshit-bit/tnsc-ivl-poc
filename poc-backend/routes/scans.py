from fastapi import APIRouter, HTTPException, Query
from database import get_db
from schemas import ScanRequest, ScanResponse, ScanListItem, StatsResponse
from utils.geo import calculate_distance, get_geo_status
from log_config import get_logger
from typing import List, Optional

router = APIRouter()
logger = get_logger("routes.scans")


@router.post("/scan", response_model=ScanResponse)
def submit_scan(scan: ScanRequest):
    logger.info("scan request: console=%s lat=%.6f lng=%.6f by=%s",
                scan.console_id, scan.scanned_lat, scan.scanned_lng, scan.scanned_by or "anonymous")

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM consoles WHERE id = %s", (scan.console_id,))
            console = cur.fetchone()

            if not console:
                logger.warning("scan rejected — console not found: %s", scan.console_id)
                raise HTTPException(
                    status_code=404,
                    detail=f"Console '{scan.console_id}' not found"
                )

            # GPS unavailable — record scan without location verification
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

            cur.execute(
                """
                INSERT INTO scans
                    (console_id, scanned_lat, scanned_lng, distance_m, geo_status, scanned_by, device_info)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, scanned_at
                """,
                (
                    scan.console_id,
                    scan.scanned_lat,
                    scan.scanned_lng,
                    distance,
                    geo_status,
                    scan.scanned_by,
                    scan.device_info,
                ),
            )
            result = cur.fetchone()

    logger.info("scan saved: id=%d console=%s status=%s", result["id"], scan.console_id, geo_status)

    return ScanResponse(
        scan_id=result["id"],
        console_id=scan.console_id,
        console_name=console["name"],
        hospital=console["hospital"],
        city=console["city"],
        scanned_at=result["scanned_at"],
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
    filters = []
    if console_id:
        filters.append(f"console_id={console_id}")
    if geo_status:
        filters.append(f"geo_status={geo_status}")
    logger.info("list scans: filters=[%s] limit=%d", ", ".join(filters) or "none", limit)

    query = """
        SELECT s.*, c.name AS console_name, c.hospital, c.city
        FROM scans s
        LEFT JOIN consoles c ON s.console_id = c.id
        WHERE 1=1
    """
    params: list = []

    if console_id:
        query += " AND s.console_id = %s"
        params.append(console_id)

    if geo_status:
        query += " AND s.geo_status = %s"
        params.append(geo_status)

    query += " ORDER BY s.scanned_at DESC LIMIT %s"
    params.append(limit)

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    logger.info("returned %d scans", len(rows))
    return [dict(row) for row in rows]


@router.get("/stats", response_model=StatsResponse)
def get_stats():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM consoles)                                   AS total_consoles,
                    (SELECT COUNT(*) FROM scans)                                      AS total_scans,
                    (SELECT COUNT(*) FROM scans WHERE geo_status = 'VERIFIED')        AS verified_scans,
                    (SELECT COUNT(*) FROM scans WHERE geo_status = 'OUTSIDE_ZONE')    AS outside_zone_scans,
                    (SELECT COUNT(DISTINCT console_id) FROM scans
                     WHERE DATE(scanned_at) = CURRENT_DATE)                          AS consoles_scanned_today,
                    (SELECT MAX(scanned_at) FROM scans)                              AS last_scan_at
                """
            )
            row = cur.fetchone()

    stats = dict(row)
    logger.info("stats: total_scans=%d verified=%d outside=%d",
                stats["total_scans"], stats["verified_scans"], stats["outside_zone_scans"])
    return StatsResponse(**stats)
