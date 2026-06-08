from fastapi import APIRouter, HTTPException
from database import get_db
from schemas import ConsoleResponse
from log_config import get_logger
from typing import List

router = APIRouter()
logger = get_logger("routes.consoles")


@router.get("/consoles", response_model=List[ConsoleResponse])
def get_all_consoles():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM consoles ORDER BY id")
            rows = cur.fetchall()
    logger.info("fetched %d consoles", len(rows))
    return [dict(row) for row in rows]


@router.get("/consoles/{console_id}", response_model=ConsoleResponse)
def get_console(console_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM consoles WHERE id = %s", (console_id,))
            row = cur.fetchone()
    if not row:
        logger.warning("console not found: %s", console_id)
        raise HTTPException(status_code=404, detail=f"Console '{console_id}' not found")
    logger.info("fetched console %s (%s)", console_id, row["hospital"])
    return dict(row)
