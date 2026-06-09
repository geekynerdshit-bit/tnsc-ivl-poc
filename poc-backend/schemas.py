from pydantic import BaseModel
from typing import Optional
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


class ScanRequest(BaseModel):
    console_id: str
    scanned_lat: Optional[float] = None   # None when GPS is denied
    scanned_lng: Optional[float] = None   # None when GPS is denied
    scanned_by: Optional[str] = None
    device_info: Optional[str] = None


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


class StatsResponse(BaseModel):
    total_consoles: int
    total_scans: int
    verified_scans: int
    outside_zone_scans: int
    consoles_scanned_today: int
    last_scan_at: Optional[datetime] = None
