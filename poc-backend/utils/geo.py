from math import radians, sin, cos, sqrt, atan2


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate distance in metres between two GPS coordinates using the Haversine formula.
    """
    R = 6371000  # Earth radius in metres

    φ1 = radians(lat1)
    φ2 = radians(lat2)
    Δφ = radians(lat2 - lat1)
    Δλ = radians(lng2 - lng1)

    a = sin(Δφ / 2) ** 2 + cos(φ1) * cos(φ2) * sin(Δλ / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return round(R * c, 2)


def get_geo_status(distance_m: float, radius_m: int) -> str:
    return "VERIFIED" if distance_m <= radius_m else "OUTSIDE_ZONE"
