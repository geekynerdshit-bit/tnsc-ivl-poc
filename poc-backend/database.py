from supabase import create_client, Client
from config import settings
from log_config import get_logger

logger = get_logger("database")


def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
