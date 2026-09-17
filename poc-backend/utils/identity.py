"""
Console identity comparison.

First visit  -> REGISTRATION: the photographed serial/mfg date are bound to the
                NFC tag and become the reference for every later visit.
Later visits -> VERIFICATION: what was photographed is compared against that
                reference.

A MISMATCH is deliberately ambiguous and is never auto-resolved: it can mean a
bad OCR read, or that the NFC tag has been moved onto a different console. Both
are recorded so a human decides which.
"""
import re
from typing import Optional, Dict

REGISTERED = "REGISTERED"
MATCH = "MATCH"
MISMATCH = "MISMATCH"
NO_PHOTO = "NO_PHOTO"


def canonical(value: Optional[str]) -> str:
    """Compare on alphanumerics only — OCR and humans disagree on punctuation."""
    if not value:
        return ""
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def compare(console: Dict, given_serial: Optional[str], given_mfg: Optional[str]) -> Dict:
    """
    Decide the identity outcome for this scan.

    Returns the status plus the specific fields that disagreed, so the UI can
    point at the offending value instead of just saying "mismatch".
    """
    known_serial = console.get("serial_number")
    is_registered = bool(known_serial)

    if not is_registered:
        if not given_serial:
            return {"status": NO_PHOTO, "mismatched": [], "is_registration": True}
        return {"status": REGISTERED, "mismatched": [], "is_registration": True}

    if not given_serial and not given_mfg:
        return {"status": NO_PHOTO, "mismatched": [], "is_registration": False}

    mismatched = []
    if given_serial and canonical(given_serial) != canonical(known_serial):
        mismatched.append("serial_number")

    known_mfg = console.get("mfg_date")
    if given_mfg and known_mfg and canonical(given_mfg) != canonical(known_mfg):
        mismatched.append("mfg_date")

    return {
        "status": MISMATCH if mismatched else MATCH,
        "mismatched": mismatched,
        "is_registration": False,
    }
