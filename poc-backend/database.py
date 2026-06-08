import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from config import settings
from log_config import get_logger

logger = get_logger("database")


@contextmanager
def get_db():
    try:
        conn = psycopg2.connect(
            settings.DATABASE_URL,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
    except psycopg2.OperationalError as e:
        logger.error("DB connection failed: %s", e)
        raise

    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error("DB error, rolled back: %s", e)
        raise
    finally:
        conn.close()
