from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ConsoleResponse(BaseModel):
    id: str
    name: str
    hospital: str
    city: str
    pincode: Optional[str] = None
    approved_lat: float
    approved_lng: float
    radius_m: int
    status: str

    # Physical identity — null until the console is registered on its first scan
    serial_number: Optional[str] = None
    ref_number: Optional[str] = None
    mfg_date: Optional[str] = None
    registered_at: Optional[datetime] = None
    registered_by: Optional[str] = None
    registration_image_url: Optional[str] = None
    is_registered: bool = False

    # "Current" location detail — the most recent scan's room/floor/department.
    # Re-captured every visit (not fixed), so a relocation within the same
    # hospital shows up here even though GPS/geo-fence cannot see it.
    current_department: Optional[str] = None
    current_floor: Optional[str] = None
    current_room: Optional[str] = None


class ScanRequest(BaseModel):
    console_id: str
    scanned_lat: Optional[float] = None   # None when GPS is denied
    scanned_lng: Optional[float] = None   # None when GPS is denied
    scanned_by: Optional[str] = None
    device_info: Optional[str] = None

    # Captured photo (base64 JPEG) and what OCR read from it
    image_base64: Optional[str] = None
    ocr_serial: Optional[str] = None
    ocr_ref: Optional[str] = None
    ocr_mfg_date: Optional[str] = None
    ocr_raw_text: Optional[str] = None

    # What the engineer confirmed — may differ from OCR after correction
    given_serial: Optional[str] = None
    given_ref: Optional[str] = None
    given_mfg_date: Optional[str] = None
    override_reason: Optional[str] = None

    # Per-visit location detail (re-captured every scan — see migration 002)
    department: Optional[str] = None
    floor: Optional[str] = None
    room_name: Optional[str] = None
    engineer_mobile: Optional[str] = None
    notes: Optional[str] = None


class ScanResponse(BaseModel):
    scan_id: int
    console_id: str
    console_name: str
    hospital: str
    city: str
    scanned_at: datetime
    scanned_lat: Optional[float] = None
    scanned_lng: Optional[float] = None
    distance_m: Optional[float] = None
    geo_status: str                        # VERIFIED | OUTSIDE_ZONE | NO_GPS
    scanned_by: Optional[str] = None

    scan_type: Optional[str] = None        # REGISTRATION | VERIFICATION
    identity_status: Optional[str] = None  # REGISTERED | MATCH | MISMATCH | NO_PHOTO
    mismatched_fields: List[str] = []
    image_url: Optional[str] = None
    given_serial: Optional[str] = None
    given_mfg_date: Optional[str] = None
    known_serial: Optional[str] = None     # what the record held before this scan
    known_mfg_date: Optional[str] = None
    manual_override: bool = False

    department: Optional[str] = None
    floor: Optional[str] = None
    room_name: Optional[str] = None
    engineer_mobile: Optional[str] = None
    notes: Optional[str] = None


class ScanListItem(BaseModel):
    id: int
    console_id: str
    console_name: Optional[str] = None
    hospital: Optional[str] = None
    city: Optional[str] = None
    scanned_at: datetime
    scanned_lat: Optional[float] = None
    scanned_lng: Optional[float] = None
    distance_m: Optional[float] = None
    geo_status: str
    scanned_by: Optional[str] = None
    device_info: Optional[str] = None

    scan_type: Optional[str] = None
    identity_status: Optional[str] = None
    image_url: Optional[str] = None
    given_serial: Optional[str] = None
    given_mfg_date: Optional[str] = None
    manual_override: Optional[bool] = False

    department: Optional[str] = None
    floor: Optional[str] = None
    room_name: Optional[str] = None
    engineer_mobile: Optional[str] = None
    notes: Optional[str] = None


class StatsResponse(BaseModel):
    total_consoles: int
    total_scans: int
    verified_scans: int
    outside_zone_scans: int
    consoles_scanned_today: int
    last_scan_at: Optional[datetime] = None
    registered_consoles: int = 0
    identity_mismatches: int = 0
