from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Console:
    id: str
    name: str
    hospital: str
    city: str
    approved_lat: float
    approved_lng: float
    radius_m: int
    status: str
    pincode: Optional[str] = None
    created_at: Optional[datetime] = None


@dataclass
class Scan:
    id: int
    console_id: str
    scanned_at: datetime
    scanned_lat: float
    scanned_lng: float
    distance_m: float
    geo_status: str
    scanned_by: Optional[str] = None
    device_info: Optional[str] = None
