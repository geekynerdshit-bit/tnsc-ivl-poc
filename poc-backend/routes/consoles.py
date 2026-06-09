from fastapi import APIRouter, HTTPException
from database import get_supabase
from schemas import ConsoleResponse
from log_config import get_logger
from typing import List

router = APIRouter()
logger = get_logger("routes.consoles")


@router.get("/consoles", response_model=List[ConsoleResponse])
def get_all_consoles():
    supabase = get_supabase()
    result = supabase.table("consoles").select("*").order("id").execute()
    logger.info("fetched %d consoles", len(result.data))
    return result.data


@router.get("/consoles/{console_id}", response_model=ConsoleResponse)
def get_console(console_id: str):
    supabase = get_supabase()
    result = supabase.table("consoles").select("*").eq("id", console_id).execute()
    if not result.data:
        logger.warning("console not found: %s", console_id)
        raise HTTPException(status_code=404, detail=f"Console '{console_id}' not found")
    logger.info("fetched console %s (%s)", console_id, result.data[0]["hospital"])
    return result.data[0]
