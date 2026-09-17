"""
Captured-photo storage (Supabase Storage bucket `console-photos`).

The SOW targets AWS S3; this keeps the same shape — the app stores a URL and
never the bytes — so swapping the backing store later is a change to this file
only.
"""
import base64
import uuid
from typing import Optional

from database import get_supabase
from log_config import get_logger

logger = get_logger("utils.storage")

BUCKET = "console-photos"
MAX_BYTES = 6 * 1024 * 1024  # reject oversized uploads before they hit Supabase


def _decode(image_b64: str) -> bytes:
    if image_b64.strip().startswith("data:") and "," in image_b64[:64]:
        image_b64 = image_b64.split(",", 1)[1]
    return base64.b64decode(image_b64, validate=True)


def upload_photo(console_id: str, image_b64: str) -> Optional[str]:
    """
    Upload a captured photo and return its public URL.

    Returns None on failure: a storage problem must not lose the scan itself,
    since the GPS evidence is the primary record.
    """
    try:
        raw = _decode(image_b64)
    except Exception as exc:
        logger.warning("photo rejected — not valid base64: %s", exc)
        return None

    if len(raw) > MAX_BYTES:
        logger.warning("photo rejected — %d bytes exceeds %d", len(raw), MAX_BYTES)
        return None

    path = f"{console_id}/{uuid.uuid4().hex}.jpg"
    try:
        supabase = get_supabase()
        supabase.storage.from_(BUCKET).upload(
            path, raw, {"content-type": "image/jpeg", "upsert": "false"}
        )
        url = supabase.storage.from_(BUCKET).get_public_url(path)
        logger.info("photo stored: %s (%d bytes)", path, len(raw))
        return url
    except Exception as exc:
        logger.error("photo upload failed for %s: %s", console_id, exc)
        return None
